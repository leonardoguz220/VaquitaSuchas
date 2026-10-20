import { createHmac } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Clock } from '../../../shared/clock/clock.js';
import { DbService } from '../../../shared/db/db.service.js';
import { DomainError } from '../../../shared/errors/domain-error.js';
import { DEFAULT_MESSAGES, ErrorCode } from '../../../shared/errors/error-codes.js';
import { InvalidMailMessageError, MailService } from '../../../shared/ports/mail.service.js';
import { GroupsRepository } from '../../subscriptions/repositories/groups.repository.js';
import { assertGroupWritable } from '../../subscriptions/services/group-errors.js';
import { RateLimitRepository } from '../../auth/repositories/rate-limit.repository.js';
import { inviteEmail } from '../domain/share-text.js';
import { nextRetry } from '../domain/retry.js';
import { InvitationsRepository } from '../repositories/invitations.repository.js';

export const INVITE_BUCKET = 'invite:user';
export const INVITES_PER_HOUR = 10;
const HOUR_MS = 60 * 60 * 1000;
const BATCH_SIZE = 50;
const MAX_BATCHES_PER_RUN = 20;

/**
 * Invitaciones por correo (RF-005-14, CA-005-14, CA-005-16): el titular agrega una fila al buzón
 * de salida (máximo 10 por hora por titular) y la tarea `notifications.deliver` envía el correo
 * con reintentos. Nunca registra direcciones.
 */
@Injectable()
export class InvitationsService {
  private readonly logger = new Logger(InvitationsService.name);
  private readonly appUrl: string;

  constructor(
    private readonly db: DbService,
    private readonly clock: Clock,
    private readonly config: ConfigService,
    private readonly groups: GroupsRepository,
    private readonly invitations: InvitationsRepository,
    private readonly limits: RateLimitRepository,
    private readonly mail: MailService,
  ) {
    this.appUrl = (config.get<string>('FRONTEND_ORIGIN') ?? 'http://localhost:3000').replace(
      /\/+$/,
      '',
    );
  }

  /** El llamador ya comprobó que `ownerId` es el titular activo del grupo (`GroupOwnerGuard`). */
  async invite(
    ownerId: string,
    groupId: string,
    rawEmail: string,
  ): Promise<{ status: 'pendiente' }> {
    const now = this.clock.now();
    const email = rawEmail.trim().toLowerCase();
    const keyHash = createHmac('sha256', this.config.getOrThrow<string>('FINGERPRINT_KEY'))
      .update(`invite:user:${ownerId}`)
      .digest('hex');
    await this.db.withTransaction(async (tx) => {
      const group = await this.groups.findById(tx, groupId);
      if (!group) throw new DomainError(ErrorCode.NOT_FOUND, 404, DEFAULT_MESSAGES.NOT_FOUND);
      assertGroupWritable(group);
      await this.invitations.lockInviter(tx, keyHash);
      const since = new Date(now.getTime() - HOUR_MS);
      const recent = await this.limits.countSince(tx, INVITE_BUCKET, keyHash, since);
      if (recent.count >= INVITES_PER_HOUR) {
        const unlockAt = (recent.oldest ?? now).getTime() + HOUR_MS;
        throw new DomainError(ErrorCode.RATE_LIMITED, 429, DEFAULT_MESSAGES.RATE_LIMITED, {
          retryAfterSeconds: Math.max(1, Math.ceil((unlockAt - now.getTime()) / 1000)),
        });
      }
      await this.limits.record(tx, INVITE_BUCKET, keyHash, now);
      await this.invitations.insert(tx, { groupId, invitedBy: ownerId, email, now });
    });
    return { status: 'pendiente' };
  }

  /** Envía las invitaciones pendientes que ya tocan (5 min, 30 min y 2 h entre reintentos). */
  async deliverDue(now: Date = this.clock.now()): Promise<number> {
    let processed = 0;
    for (let batch = 0; batch < MAX_BATCHES_PER_RUN; batch++) {
      const handled = await this.db.withTransaction(async (tx) => {
        const due = await this.invitations.claimDue(tx, now, BATCH_SIZE);
        for (const item of due) {
          const attempts = item.attempts + 1;
          // El grupo pudo cerrarse o congelarse después: ya no tiene sentido invitar.
          if (item.groupStatus !== 'activo' || item.groupFrozen) {
            await this.invitations.markFailed(tx, item.id, attempts);
            continue;
          }
          try {
            const content = inviteEmail({
              inviterName: item.inviterName,
              groupName: item.groupName,
              inviteUrl: `${this.appUrl}/unirse?codigo=${encodeURIComponent(item.inviteCode)}`,
              code: item.inviteCode,
            });
            await this.mail.send({ to: item.recipientEmail, ...content });
            await this.invitations.markSent(tx, item.id, now, attempts);
          } catch (error) {
            const name = error instanceof Error ? error.name : 'Error';
            const next =
              error instanceof InvalidMailMessageError
                ? ({ status: 'failed' } as const)
                : nextRetry(attempts, now);
            if (next.status === 'failed') await this.invitations.markFailed(tx, item.id, attempts);
            else await this.invitations.reschedule(tx, item.id, attempts, next.nextAttemptAt);
            // Solo el id y el tipo de error: sin dirección ni contenido.
            this.logger.warn(`Invitación ${item.id} falló (${name}).`);
          }
        }
        return due.length;
      });
      processed += handled;
      if (handled < BATCH_SIZE) break;
    }
    return processed;
  }
}
