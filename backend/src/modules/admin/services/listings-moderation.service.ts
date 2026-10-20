import { Injectable } from '@nestjs/common';
import { Clock } from '../../../shared/clock/clock.js';
import { DbService } from '../../../shared/db/db.service.js';
import { DomainError } from '../../../shared/errors/domain-error.js';
import { DEFAULT_MESSAGES, ErrorCode } from '../../../shared/errors/error-codes.js';
import type { AdminAuditAction } from '../domain/audit-entry.js';
import { NotificationService } from '../../notifications/services/notification.service.js';
import { AuditService } from './audit.service.js';
import { requireReason } from './admin-errors.js';
import {
  ListingsModerationRepository,
  type ListingForModeration,
  type ModerationQueueItem,
} from '../repositories/listings-moderation.repository.js';
import { UsersAdminService } from './users-admin.service.js';

export type ModerationDecision = 'restore' | 'delete' | 'delete-and-suspend';

export interface ModerationResult {
  listingId: string;
  decision: ModerationDecision;
  status: 'activa' | 'cerrada';
}

const ACTIONS: Record<ModerationDecision, AdminAuditAction> = {
  restore: 'publicacion_restaurar',
  delete: 'publicacion_eliminar',
  'delete-and-suspend': 'publicacion_eliminar_y_suspender',
};

const notFound = (): DomainError =>
  new DomainError(ErrorCode.NOT_FOUND, 404, DEFAULT_MESSAGES.NOT_FOUND);

/** Moderación de publicaciones reportadas u ocultas (spec 009, US6; RF-009-12 a 14). */
@Injectable()
export class ListingsModerationService {
  constructor(
    private readonly db: DbService,
    private readonly clock: Clock,
    private readonly listings: ListingsModerationRepository,
    private readonly audit: AuditService,
    private readonly notifications: NotificationService,
    private readonly users: UsersAdminService,
  ) {}

  queue(): Promise<{ items: ModerationQueueItem[] }> {
    return this.listings.queue(this.db).then((items) => ({ items }));
  }

  /**
   * Restaurar solo aplica a una publicación oculta; eliminar, a una viva (`activa` u `oculta`).
   * Todo en una transacción: cambio, auditoría con motivo, aviso al titular y, si se pide,
   * la suspensión del titular (el correo sale después de confirmar).
   */
  async decide(
    adminId: string,
    listingId: string,
    decision: ModerationDecision,
    reasonInput: unknown,
  ): Promise<ModerationResult> {
    const reason = requireReason(reasonInput);
    const outcome = await this.db.withTransaction(async (tx) => {
      const listing = await this.listings.lock(tx, listingId);
      if (!listing) throw notFound();
      this.assertTransition(listing, decision);
      const now = this.clock.now();
      if (decision === 'restore') await this.listings.restore(tx, listingId, now);
      else await this.listings.close(tx, listingId, now);
      const n = (await this.listings.decisionCount(tx, listingId)) + 1;
      await this.audit.record(tx, {
        actorId: adminId,
        action: ACTIONS[decision],
        targetType: 'listing',
        targetId: listingId,
        reason,
        metadata: { groupId: listing.groupId, previousStatus: listing.status },
      });
      await this.notifications.notify(tx, {
        userId: listing.ownerId,
        type: 'publicacion_decision',
        role: 'titular',
        entity: { type: 'listing', id: listingId },
        data: { groupName: listing.groupName, groupId: listing.groupId, reason },
        n,
      });
      const email =
        decision === 'delete-and-suspend'
          ? await this.users.suspendWithin(tx, adminId, listing.ownerId, reason)
          : null;
      return { email };
    });
    if (outcome.email) await this.users.sendSuspensionMail(outcome.email, reason);
    return { listingId, decision, status: decision === 'restore' ? 'activa' : 'cerrada' };
  }

  private assertTransition(listing: ListingForModeration, decision: ModerationDecision): void {
    const allowed =
      decision === 'restore'
        ? listing.status === 'oculta'
        : listing.status === 'activa' || listing.status === 'oculta';
    if (!allowed) {
      throw new DomainError(
        'INVALID_TRANSITION',
        409,
        'La publicación no admite esta decisión en su estado actual.',
      );
    }
  }
}
