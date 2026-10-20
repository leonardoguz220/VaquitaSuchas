import { Injectable } from '@nestjs/common';
import { Clock } from '../../../shared/clock/clock.js';
import { DbService, type DbTransaction } from '../../../shared/db/db.service.js';
import { TxEventBus } from '../../../shared/events/tx-event-bus.js';
import type { UserUnbanned } from '../../../shared/events/user-events.js';
import { Inject } from '@nestjs/common';
import { AUDIT_PORT, type AuditPort } from '../../join-requests/ports/audit.port.js';
import type { BanInput, BanPort } from '../../join-requests/ports/ban.port.js';
import { IdentityService } from '../../users/services/identity.service.js';
import { UserAccountService } from '../../users/services/user-account.service.js';
import { canActOnUser, canRevokeBan } from '../domain/admin-rules.js';
import {
  USER_GROUP_COUNTS_PORT,
  type UserGroupCountsPort,
} from '../ports/user-group-counts.port.js';
import { BansRepository } from '../repositories/bans.repository.js';
import { UsersAdminRepository } from '../repositories/users-admin.repository.js';
import { requireReason, ruleError, userNotFound } from './admin-errors.js';

/**
 * Baneo de cuentas y su revisión (RF-009-19, RF-009-22, RF-009-23). `ban` corre en la transacción
 * de quien llama (el endpoint o la resolución de un reclamo de la spec 010). Los efectos sobre
 * grupos y solicitudes los aplican, en esa misma transacción, los manejadores de `UserBanned`
 * de `subscriptions` y `join-requests`.
 */
@Injectable()
export class BanService implements BanPort {
  constructor(
    private readonly db: DbService,
    private readonly clock: Clock,
    private readonly bus: TxEventBus,
    private readonly users: UsersAdminRepository,
    private readonly bans: BansRepository,
    private readonly account: UserAccountService,
    private readonly identity: IdentityService,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
    @Inject(USER_GROUP_COUNTS_PORT) private readonly groupCounts: UserGroupCountsPort,
  ) {}

  async ban(tx: DbTransaction, input: BanInput): Promise<{ banId: string }> {
    const reason = requireReason(input.reason);
    const target = await this.users.findDetail(tx, input.userId, true);
    if (!target) throw userNotFound();
    const actor =
      input.adminId === input.userId ? target : await this.users.findDetail(tx, input.adminId);
    if (!actor) throw userNotFound();
    const verdict = canActOnUser({ actor, target, action: 'ban' });
    if (!verdict.ok) throw ruleError(verdict);

    const counts = await this.groupCounts.count(tx, input.userId);
    const ban = await this.bans.insert(tx, {
      userId: input.userId,
      reason,
      source: input.disputeId ? 'reclamo' : 'admin',
      disputeId: input.disputeId,
      bannedBy: input.adminId,
      bannedAt: this.clock.now(),
    });
    // Cierra las sesiones y publica `UserBanned` (congela, retira, rechaza y cancela).
    await this.account.setStatus(tx, input.userId, 'baneado');
    await this.identity.blockIdentities(tx, input.userId, ban.id);
    await this.audit.record(tx, {
      actorId: input.adminId,
      action: 'usuario_banear',
      targetType: 'user',
      targetId: input.userId,
      reason,
      metadata: {
        banId: ban.id,
        disputeId: input.disputeId,
        effects: { ownedGroups: counts.asHost, memberGroups: counts.asMember },
      },
    });
    return { banId: ban.id };
  }

  /** `POST /admin/bans/:banId/revoke` (CA-009-34): otro administrador, con motivo, una sola vez. */
  async revoke(adminId: string, banId: string, reasonInput: unknown): Promise<{ userId: string }> {
    const reason = requireReason(reasonInput);
    return this.db.withTransaction(async (tx) => {
      const ban = await this.bans.findById(tx, banId, true);
      if (!ban) throw userNotFound();
      const verdict = canRevokeBan({ ban, actorId: adminId });
      if (!verdict.ok) throw ruleError(verdict);
      await this.bans.markRevoked(tx, {
        id: ban.id,
        revokedBy: adminId,
        revokeReason: reason,
        revokedAt: this.clock.now(),
      });
      await this.identity.releaseIdentities(tx, ban.id);
      await this.account.setStatus(tx, ban.userId, 'activo');
      // La spec 001 descongela los grupos que ese baneo congeló; no restituye otras pertenencias.
      const event: UserUnbanned = { type: 'users.unbanned', userId: ban.userId };
      await this.bus.publish(tx, event);
      await this.audit.record(tx, {
        actorId: adminId,
        action: 'baneo_revertir',
        targetType: 'ban',
        targetId: ban.id,
        reason,
        metadata: { userId: ban.userId, previousStatus: 'baneado' },
      });
      return { userId: ban.userId };
    });
  }
}
