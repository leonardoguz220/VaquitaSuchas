import { Injectable } from '@nestjs/common';
import { Clock } from '../../../shared/clock/clock.js';
import { DbService } from '../../../shared/db/db.service.js';
import { DomainError } from '../../../shared/errors/domain-error.js';
import { DEFAULT_MESSAGES, ErrorCode } from '../../../shared/errors/error-codes.js';
import type { UserSelf } from '../../users/domain/user-self.js';
import { UserSelfService } from '../../users/services/user-self.service.js';
import { registerStatus, type RegisterStatus } from '../domain/register-status.js';
import { hashToken } from '../domain/tokens.js';
import { PhoneTokensRepository } from '../repositories/phone-tokens.repository.js';
import { RegistrationRepository } from '../repositories/registration.repository.js';
import { SessionService } from './session.service.js';

export type RegisterStatusResponse =
  RegisterStatus | { status: 'verified'; sessionToken: string; user: UserSelf };

/** Sondeo del registro con el secreto del navegador (RF-003-04, RF-003-21). */
@Injectable()
export class RegistrationStatusService {
  constructor(
    private readonly db: DbService,
    private readonly clock: Clock,
    private readonly sessions: SessionService,
    private readonly users: RegistrationRepository,
    private readonly tokens: PhoneTokensRepository,
    private readonly selfView: UserSelfService,
  ) {}

  async status(registrationSecret: string): Promise<RegisterStatusResponse> {
    return this.db.withTransaction(async (tx) => {
      const now = this.clock.now();
      const account = await this.users.findPollingAccount(tx, hashToken(registrationSecret), now);
      if (!account) {
        throw new DomainError(ErrorCode.UNAUTHENTICATED, 401, DEFAULT_MESSAGES.UNAUTHENTICATED);
      }
      if (account.verified_at) {
        // La sesión se entrega una sola vez: el secreto queda canjeado.
        await this.users.redeemSecret(tx, account.id, now);
        const user = await this.selfView.getById(tx, account.id);
        return {
          status: 'verified' as const,
          sessionToken: this.sessions.issue({
            id: account.id,
            sessionVersion: account.session_version,
          }),
          user: user!,
        };
      }
      const latest = await this.tokens.findLatestByUser(tx, account.id);
      const telegramId = latest?.started_by_telegram_id ?? null;
      const telegramTaken =
        telegramId !== null && (await this.users.telegramTaken(tx, Number(telegramId), account.id));
      return registerStatus(
        latest
          ? { expiresAt: latest.expires_at, usedAt: latest.used_at, outcome: latest.outcome }
          : null,
        telegramTaken,
        now,
      );
    });
  }
}
