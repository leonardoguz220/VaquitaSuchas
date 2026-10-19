import { createHmac, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Clock } from '../../../shared/clock/clock.js';
import { DbService, type Queryable } from '../../../shared/db/db.service.js';
import { DomainError } from '../../../shared/errors/domain-error.js';
import { DEFAULT_MESSAGES, ErrorCode } from '../../../shared/errors/error-codes.js';
import { generateInviteCode } from '../domain/invite-code.js';
import { GroupsRepository, type GroupRow } from '../repositories/groups.repository.js';
import { InviteAttemptsRepository } from '../repositories/invite-attempts.repository.js';
import { assertGroupWritable } from './group-errors.js';

const BUCKET = 'invite_code_fail:user';
export const INVITE_CODE_ATTEMPTS = 5;
export const INVITE_FAILURES_MAX = 10;
export const INVITE_FAILURES_WINDOW_MS = 15 * 60_000;

/** Mayúsculas y sin espacios (RF-001-06). */
export const normalizeInviteCode = (code: string): string => code.replace(/\s+/g, '').toUpperCase();

/**
 * Código de invitación (spec 001 RF-001-06/07/08, RNF-001-02): `resolve` lo usa la spec 010
 * (`POST /join-requests`) y `regenerate` el titular.
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

  /** Código nuevo y libre: hasta 5 intentos ante una colisión (RF-001-06). */
  async generateUnique(q: Queryable): Promise<string> {
    for (let attempt = 0; attempt < INVITE_CODE_ATTEMPTS; attempt++) {
      const code = generateInviteCode((size) => randomBytes(size));
      if (!(await this.groups.findByInviteCode(q, code))) return code;
    }
    throw new DomainError(
      ErrorCode.SERVICE_UNAVAILABLE,
      503,
      'No pudimos generar el código de invitación. Intenta de nuevo.',
    );
  }

  /**
   * `POST /groups/:id/invite-code/regenerate` (RF-001-08): el titular reemplaza el código en una sola
   * sentencia y el anterior deja de existir al instante. No aplica a un grupo cerrado o congelado.
   */
  async regenerate(groupId: string): Promise<{ inviteCode: string }> {
    return this.db.withTransaction(async (tx) => {
      const group = await this.groups.findByIdForUpdate(tx, groupId);
      if (!group) throw new DomainError(ErrorCode.NOT_FOUND, 404, DEFAULT_MESSAGES.NOT_FOUND);
      assertGroupWritable(group);
      const inviteCode = await this.generateUnique(tx);
      await this.groups.replaceInviteCode(tx, groupId, inviteCode);
      return { inviteCode };
    });
  }
}
