import { createHmac } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Clock } from '../../../shared/clock/clock.js';
import { DbService } from '../../../shared/db/db.service.js';
import { DomainError } from '../../../shared/errors/domain-error.js';
import { DEFAULT_MESSAGES, ErrorCode } from '../../../shared/errors/error-codes.js';
import { GroupsRepository, type GroupRow } from '../repositories/groups.repository.js';
import { InviteAttemptsRepository } from '../repositories/invite-attempts.repository.js';

const BUCKET = 'invite_code_fail:user';
export const INVITE_FAILURES_MAX = 10;
export const INVITE_FAILURES_WINDOW_MS = 15 * 60_000;

/** Mayúsculas y sin espacios (RF-001-06). */
export const normalizeInviteCode = (code: string): string => code.replace(/\s+/g, '').toUpperCase();

/**
 * Resolución del código de invitación (spec 001 RF-001-06/07/08, RNF-001-02). Dependencia mínima de
 * la spec 010 (`POST /join-requests`); `regenerate` y su endpoint siguen pendientes (spec 001 T023).
 */
@Injectable()
export class InviteCodeService {
  constructor(
    private readonly db: DbService,
    private readonly clock: Clock,
    private readonly groups: GroupsRepository,
    private readonly attempts: InviteAttemptsRepository,
    private readonly config: ConfigService,
  ) {}

  /**
   * Devuelve el grupo activo del código. Inexistente, regenerado o de grupo cerrado dan el mismo
   * `422 INVALID_INVITE_CODE` genérico y cuentan como fallo: 10 en 15 minutos → `429 RATE_LIMITED`
   * (CA-001-18). El fallo se registra fuera de cualquier transacción para que sobreviva a un rollback.
   */
  async resolve(userId: string, code: string): Promise<GroupRow> {
    const now = this.clock.now();
    const keyHash = createHmac('sha256', this.config.getOrThrow<string>('FINGERPRINT_KEY'))
      .update(`invite:${userId}`)
      .digest('hex');
    const since = new Date(now.getTime() - INVITE_FAILURES_WINDOW_MS);
    const failures = await this.attempts.countSince(this.db, BUCKET, keyHash, since);
    if (failures.count >= INVITE_FAILURES_MAX) {
      const unlockAt = (failures.oldest ?? now).getTime() + INVITE_FAILURES_WINDOW_MS;
      throw new DomainError(ErrorCode.RATE_LIMITED, 429, DEFAULT_MESSAGES.RATE_LIMITED, {
        retryAfterSeconds: Math.max(1, Math.ceil((unlockAt - now.getTime()) / 1000)),
      });
    }
    const group = await this.groups.findByInviteCode(this.db, normalizeInviteCode(code));
    if (!group || group.status !== 'activo') {
      await this.attempts.record(this.db, BUCKET, keyHash, now);
      throw new DomainError('INVALID_INVITE_CODE', 422, 'Código inválido.', {
        rule: 'RF-001-07',
      });
    }
    return group;
  }
}
