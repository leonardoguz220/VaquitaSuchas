import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Clock } from '../../../shared/clock/clock.js';
import { DbService } from '../../../shared/db/db.service.js';
import { DomainError } from '../../../shared/errors/domain-error.js';
import { DEFAULT_MESSAGES, ErrorCode } from '../../../shared/errors/error-codes.js';
import { keyHash } from '../domain/key-hash.js';
import { passwordChangedMail, passwordResetMail } from '../domain/mail-templates.js';
import { normalizeEmail } from '../domain/email.js';
import { canLogin } from '../domain/login.js';
import {
  RESET_REQUEST_LIMIT,
  RESET_WINDOW_MS,
  resetTokenExpiry,
  validateNewPassword,
} from '../domain/password-reset.js';
import { retryAfterSeconds, underLimit } from '../domain/registration.js';
import { generateToken, hashToken, tokenIsUsable } from '../domain/tokens.js';
import { LoginRepository } from '../repositories/login.repository.js';
import { RateLimitRepository } from '../repositories/rate-limit.repository.js';
import { ResetTokensRepository } from '../repositories/reset-tokens.repository.js';
import { MailOutbox } from './mail-outbox.js';
import { PasswordHasher } from './password-hasher.js';

const BUCKET_RESET_EMAIL = 'reset:email';

function invalidToken(): DomainError {
  return new DomainError(
    'RESET_TOKEN_INVALID',
    410,
    'Este enlace venció o ya se usó. Pide uno nuevo.',
    { canRequestNew: true },
  );
}

/** Recuperación de contraseña por correo (RF-003-10 a 13, 18). */
@Injectable()
export class PasswordService {
  private readonly fingerprintKey: string;
  private readonly frontendOrigin: string;

  constructor(
    config: ConfigService,
    private readonly db: DbService,
    private readonly clock: Clock,
    private readonly hasher: PasswordHasher,
    private readonly logins: LoginRepository,
    private readonly tokens: ResetTokensRepository,
    private readonly limits: RateLimitRepository,
    private readonly outbox: MailOutbox,
  ) {
    this.fingerprintKey = config.getOrThrow<string>('FINGERPRINT_KEY');
    this.frontendOrigin = (
      config.get<string>('FRONTEND_ORIGIN') ?? 'http://localhost:3000'
    ).replace(/\/$/, '');
  }

  /** La respuesta no depende de si la cuenta existe; solo el límite por correo escrito se nota. */
  async forgot(rawEmail: string): Promise<void> {
    const email = normalizeEmail(rawEmail);
    const emailKey = keyHash(this.fingerprintKey, 'email', email);
    const token = generateToken();

    const mail = await this.db.withTransaction(async (tx) => {
      const now = this.clock.now();
      const since = new Date(now.getTime() - RESET_WINDOW_MS);
      const { count, oldest } = await this.limits.countSince(
        tx,
        BUCKET_RESET_EMAIL,
        emailKey,
        since,
      );
      if (!underLimit(count, RESET_REQUEST_LIMIT)) {
        throw new DomainError(ErrorCode.RATE_LIMITED, 429, DEFAULT_MESSAGES.RATE_LIMITED, {
          retryAfterSeconds: retryAfterSeconds(oldest ?? now, now, RESET_WINDOW_MS),
        });
      }
      await this.limits.record(tx, BUCKET_RESET_EMAIL, emailKey, now);

      const account = await this.logins.findByEmail(tx, email);
      // Cuenta inexistente, suspendida, baneada o sin verificar: no se envía nada (CA-003-23).
      if (!account || !canLogin(account)) return null;
      await this.tokens.invalidateOpen(tx, account.id, now);
      await this.tokens.insert(tx, {
        userId: account.id,
        tokenHash: hashToken(token),
        expiresAt: resetTokenExpiry(now),
      });
      return passwordResetMail(`${this.frontendOrigin}/recuperar/${token}`);
    });

    // Después de confirmar la transacción: un fallo de envío no deshace el enlace.
    if (mail) await this.outbox.send({ to: email, ...mail });
  }

  async reset(token: string, newPassword: string, confirmation: string): Promise<void> {
    const email = await this.db.withTransaction(async (tx) => {
      const now = this.clock.now();
      const row = await this.tokens.findByHashForUpdate(tx, hashToken(token));
      if (
        !row ||
        tokenIsUsable({ expiresAt: row.expires_at, usedAt: row.used_at }, now) !== 'usable' ||
        !canLogin(row)
      ) {
        throw invalidToken();
      }
      const errors = validateNewPassword(newPassword, confirmation, row.email);
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
      const passwordHash = await this.hasher.hash(newPassword);
      await this.tokens.invalidateOpen(tx, row.user_id, now);
      await this.logins.replacePassword(tx, row.user_id, passwordHash);
      return row.email;
    });
    await this.outbox.send({ to: email, ...passwordChangedMail() });
  }
}
