import { createHmac } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Clock } from '../../../shared/clock/clock.js';
import { DbService, type DbTransaction } from '../../../shared/db/db.service.js';
import { DomainError } from '../../../shared/errors/domain-error.js';
import { DEFAULT_MESSAGES, ErrorCode } from '../../../shared/errors/error-codes.js';
import { IdentityService } from '../../users/services/identity.service.js';
import { normalizeCi } from '../domain/ci.js';
import { normalizeEmail } from '../domain/email.js';
import {
  BUCKET_REGISTER_IP,
  BUCKET_TG_TOKEN_EMAIL,
  BUCKET_TG_TOKEN_IP,
  RATE_WINDOW_MS,
  REGISTER_IP_LIMIT,
  TG_TOKEN_LIMIT,
  retryAfterSeconds,
  secretExpiry,
  tokenExpiry,
  underLimit,
} from '../domain/registration.js';
import { generateToken, hashToken } from '../domain/tokens.js';
import { validateRegistration } from '../domain/validate-registration.js';
import { DATA_POLICY_VERSION } from '../policy.js';
import { PhoneTokensRepository } from '../repositories/phone-tokens.repository.js';
import { RateLimitRepository } from '../repositories/rate-limit.repository.js';
import { RegistrationRepository } from '../repositories/registration.repository.js';
import { PasswordHasher } from './password-hasher.js';

export interface RegisterCommand {
  fullName: string;
  email: string;
  ci: string;
  password: string;
  passwordConfirmation: string;
  ip: string;
}

export interface VerificationLink {
  telegramUrl: string;
  expiresAt: string;
}

const PG_UNIQUE_VIOLATION = '23505';

function rateLimited(retryAfter: number): DomainError {
  return new DomainError(ErrorCode.RATE_LIMITED, 429, DEFAULT_MESSAGES.RATE_LIMITED, {
    retryAfterSeconds: retryAfter,
  });
}

/** Registro de cuentas y enlaces de verificación por Telegram (RF-003-01 a 04, 21, 23). */
@Injectable()
export class RegistrationService {
  private readonly fingerprintKey: string;
  private readonly botUsername: string;

  constructor(
    config: ConfigService,
    private readonly db: DbService,
    private readonly clock: Clock,
    private readonly identity: IdentityService,
    private readonly hasher: PasswordHasher,
    private readonly users: RegistrationRepository,
    private readonly tokens: PhoneTokensRepository,
    private readonly limits: RateLimitRepository,
  ) {
    this.fingerprintKey = config.getOrThrow<string>('FINGERPRINT_KEY');
    this.botUsername = config.get<string>('TELEGRAM_BOT_USERNAME') ?? 'VaquitaBot';
  }

  async register(
    cmd: RegisterCommand,
  ): Promise<{ registrationSecret: string; verification: VerificationLink }> {
    const errors = validateRegistration(cmd);
    if (Object.keys(errors.fields).length > 0) {
      throw new DomainError(
        ErrorCode.VALIDATION_ERROR,
        400,
        DEFAULT_MESSAGES.VALIDATION_ERROR,
        errors.rules.length > 0
          ? { fields: errors.fields, rules: errors.rules }
          : { fields: errors.fields },
      );
    }
    const email = normalizeEmail(cmd.email);
    const ci = normalizeCi(cmd.ci)!;
    // El hash tarda cientos de ms: se calcula antes de abrir la transacción.
    const passwordHash = await this.hasher.hash(cmd.password);
    const ipHash = this.keyHash('ip', cmd.ip);
    const emailHash = this.keyHash('email', this.identity.emailFingerprint(email));
    const secret = generateToken();
    const token = generateToken();

    try {
      return await this.db.withTransaction(async (tx) => {
        const now = this.clock.now();
        await this.assertUnder(tx, BUCKET_REGISTER_IP, ipHash, REGISTER_IP_LIMIT, now);
        await this.assertUnder(tx, BUCKET_TG_TOKEN_IP, ipHash, TG_TOKEN_LIMIT, now);
        await this.assertUnder(tx, BUCKET_TG_TOKEN_EMAIL, emailHash, TG_TOKEN_LIMIT, now);

        // Mismo mensaje sin indicar si fue el correo o la CI (CA-003-21, 30, 35).
        if (await this.identity.isBlocked(tx, { email, ci })) {
          throw new DomainError(
            'REGISTRATION_NOT_ALLOWED',
            403,
            'No es posible crear la cuenta con estos datos.',
          );
        }

        const existing = await this.users.findByEmailForUpdate(tx, email);
        if (existing?.verified_at) throw this.emailTaken();
        const ciFingerprint = this.identity.fingerprint('ci', ci);
        const ciOwner = await this.users.findIdByCiFingerprint(tx, ciFingerprint);
        if (ciOwner && ciOwner !== existing?.id) throw this.ciTaken();

        const row = {
          fullName: cmd.fullName.trim(),
          email,
          emailFingerprint: this.identity.emailFingerprint(email),
          passwordHash,
          ciEncrypted: this.identity.encryptCi(ci),
          ciFingerprint,
          policyVersion: DATA_POLICY_VERSION,
          now,
          secretHash: hashToken(secret),
          secretExpiresAt: secretExpiry(now),
        };
        let userId: string;
        if (existing) {
          userId = existing.id;
          await this.users.updateUnverified(tx, userId, row);
          await this.tokens.invalidateOpen(tx, userId, now);
        } else {
          userId = await this.users.insert(tx, row);
        }

        await this.limits.record(tx, BUCKET_REGISTER_IP, ipHash, now);
        const verification = await this.issueToken(tx, userId, token, ipHash, emailHash, now);
        return { registrationSecret: secret, verification };
      });
    } catch (error) {
      // La base resuelve la carrera de dos registros simultáneos (CA-003-19).
      const pg = error as { code?: string; constraint?: string };
      if (pg.code === PG_UNIQUE_VIOLATION) {
        throw pg.constraint === 'users_ci_fingerprint_key' ? this.ciTaken() : this.emailTaken();
      }
      throw error;
    }
  }

  /** Enlace nuevo mientras la cuenta sigue sin verificar; los anteriores dejan de servir. */
  async requestNewLink(
    registrationSecret: string,
    ip: string,
  ): Promise<{ verification: VerificationLink }> {
    const ipHash = this.keyHash('ip', ip);
    const token = generateToken();
    return this.db.withTransaction(async (tx) => {
      const now = this.clock.now();
      const user = await this.users.findBySecretHash(tx, hashToken(registrationSecret), now);
      if (!user) {
        throw new DomainError(ErrorCode.UNAUTHENTICATED, 401, DEFAULT_MESSAGES.UNAUTHENTICATED);
      }
      if (user.verified_at) {
        throw new DomainError('ALREADY_VERIFIED', 409, 'Esta cuenta ya está verificada.');
      }
      const emailHash = this.keyHash('email', this.identity.emailFingerprint(user.email));
      await this.assertUnder(tx, BUCKET_TG_TOKEN_IP, ipHash, TG_TOKEN_LIMIT, now);
      await this.assertUnder(tx, BUCKET_TG_TOKEN_EMAIL, emailHash, TG_TOKEN_LIMIT, now);
      await this.tokens.invalidateOpen(tx, user.id, now);
      const verification = await this.issueToken(tx, user.id, token, ipHash, emailHash, now);
      return { verification };
    });
  }

  private async issueToken(
    tx: DbTransaction,
    userId: string,
    token: string,
    ipHash: string,
    emailHash: string,
    now: Date,
  ): Promise<VerificationLink> {
    const expiresAt = tokenExpiry(now);
    await this.tokens.insert(tx, { userId, tokenHash: hashToken(token), expiresAt, ipHash });
    await this.limits.record(tx, BUCKET_TG_TOKEN_IP, ipHash, now);
    await this.limits.record(tx, BUCKET_TG_TOKEN_EMAIL, emailHash, now);
    return {
      telegramUrl: `https://t.me/${this.botUsername}?start=${token}`,
      expiresAt: expiresAt.toISOString(),
    };
  }

  private async assertUnder(
    tx: DbTransaction,
    bucket: string,
    keyHash: string,
    limit: number,
    now: Date,
  ): Promise<void> {
    const since = new Date(now.getTime() - RATE_WINDOW_MS);
    const { count, oldest } = await this.limits.countSince(tx, bucket, keyHash, since);
    if (!underLimit(count, limit)) throw rateLimited(retryAfterSeconds(oldest ?? now, now));
  }

  /** La IP y el correo nunca se guardan: solo un HMAC con la clave del servidor. */
  private keyHash(kind: string, value: string): string {
    return createHmac('sha256', this.fingerprintKey).update(`${kind}:${value}`).digest('hex');
  }

  private emailTaken(): DomainError {
    return new DomainError('EMAIL_TAKEN', 409, 'Ese correo ya está registrado.');
  }

  private ciTaken(): DomainError {
    return new DomainError('CI_TAKEN', 409, 'Ya existe una cuenta con esa cédula.');
  }
}
