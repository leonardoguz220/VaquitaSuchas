import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Clock } from '../../../shared/clock/clock.js';
import { DbService, type DbTransaction } from '../../../shared/db/db.service.js';
import { DomainError } from '../../../shared/errors/domain-error.js';
import { DEFAULT_MESSAGES, ErrorCode } from '../../../shared/errors/error-codes.js';
import type { UserSelf } from '../../users/domain/user-self.js';
import { IdentityService } from '../../users/services/identity.service.js';
import { UserSelfService } from '../../users/services/user-self.service.js';
import { keyHash } from '../domain/key-hash.js';
import { registerStatus, type RegisterStatus } from '../domain/register-status.js';
import {
  BUCKET_TG_TOKEN_EMAIL,
  BUCKET_TG_TOKEN_IP,
  RATE_WINDOW_MS,
  TG_TOKEN_LIMIT,
  retryAfterSeconds,
  tokenExpiry,
  underLimit,
} from '../domain/registration.js';
import { generateToken, hashToken } from '../domain/tokens.js';
import { PhoneTokensRepository } from '../repositories/phone-tokens.repository.js';
import { RateLimitRepository } from '../repositories/rate-limit.repository.js';
import { RegistrationRepository } from '../repositories/registration.repository.js';
import type { VerificationLink } from './registration.service.js';

export type PhoneChangeStatus = RegisterStatus | { status: 'verified'; user: UserSelf };

/** Cambio de celular con el bot (RF-003-15): el número nuevo sale del contacto de Telegram. */
@Injectable()
export class PhoneChangeService {
  private readonly fingerprintKey: string;
  private readonly botUsername: string;

  constructor(
    config: ConfigService,
    private readonly db: DbService,
    private readonly clock: Clock,
    private readonly identity: IdentityService,
    private readonly selfView: UserSelfService,
    private readonly tokens: PhoneTokensRepository,
    private readonly users: RegistrationRepository,
    private readonly limits: RateLimitRepository,
  ) {
    this.fingerprintKey = config.getOrThrow<string>('FINGERPRINT_KEY');
    this.botUsername = config.get<string>('TELEGRAM_BOT_USERNAME') ?? 'VaquitaBot';
  }

  async start(userId: string, ip: string): Promise<{ verification: VerificationLink }> {
    const token = generateToken();
    const ipHash = keyHash(this.fingerprintKey, 'ip', ip);
    return this.db.withTransaction(async (tx) => {
      const now = this.clock.now();
      const self = await this.selfView.getById(tx, userId);
      if (!self) {
        throw new DomainError(ErrorCode.UNAUTHENTICATED, 401, DEFAULT_MESSAGES.UNAUTHENTICATED);
      }
      // Mismos contadores que el registro: 5 enlaces por hora por IP y por correo.
      const emailHash = keyHash(
        this.fingerprintKey,
        'email',
        this.identity.emailFingerprint(self.email),
      );
      await this.assertUnder(tx, BUCKET_TG_TOKEN_IP, ipHash, now);
      await this.assertUnder(tx, BUCKET_TG_TOKEN_EMAIL, emailHash, now);
      await this.tokens.invalidateOpen(tx, userId, now, 'cambio_celular');
      const expiresAt = tokenExpiry(now);
      await this.tokens.insert(tx, {
        userId,
        tokenHash: hashToken(token),
        expiresAt,
        ipHash,
        purpose: 'cambio_celular',
      });
      await this.limits.record(tx, BUCKET_TG_TOKEN_IP, ipHash, now);
      await this.limits.record(tx, BUCKET_TG_TOKEN_EMAIL, emailHash, now);
      return {
        verification: {
          telegramUrl: `https://t.me/${this.botUsername}?start=${token}`,
          expiresAt: expiresAt.toISOString(),
        },
      };
    });
  }

  async status(userId: string): Promise<PhoneChangeStatus> {
    return this.db.withTransaction(async (tx) => {
      const now = this.clock.now();
      const latest = await this.tokens.findLatestByUser(tx, userId, 'cambio_celular');
      if (latest?.outcome === 'verificado') {
        return { status: 'verified' as const, user: (await this.selfView.getById(tx, userId))! };
      }
      const telegramId = latest?.started_by_telegram_id ?? null;
      const telegramTaken =
        telegramId !== null && (await this.users.telegramTaken(tx, Number(telegramId), userId));
      return registerStatus(
        latest
          ? { expiresAt: latest.expires_at, usedAt: latest.used_at, outcome: latest.outcome }
          : null,
        telegramTaken,
        now,
      );
    });
  }

  private async assertUnder(
    tx: DbTransaction,
    bucket: string,
    key: string,
    now: Date,
  ): Promise<void> {
    const since = new Date(now.getTime() - RATE_WINDOW_MS);
    const { count, oldest } = await this.limits.countSince(tx, bucket, key, since);
    if (!underLimit(count, TG_TOKEN_LIMIT)) {
      throw new DomainError(ErrorCode.RATE_LIMITED, 429, DEFAULT_MESSAGES.RATE_LIMITED, {
        retryAfterSeconds: retryAfterSeconds(oldest ?? now, now),
      });
    }
  }
}
