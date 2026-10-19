import { Injectable, Logger } from '@nestjs/common';
import { DbService, type DbTransaction } from '../../../shared/db/db.service.js';
import type {
  ChargeBecameOverdue,
  MemberRemovedForNonPayment,
} from '../../../shared/events/charge-events.js';
import { TxEventBus } from '../../../shared/events/tx-event-bus.js';
import { GroupsRepository } from '../../subscriptions/repositories/groups.repository.js';
import { MembersRepository } from '../../subscriptions/repositories/members.repository.js';
import { MembershipService } from '../../subscriptions/services/membership.service.js';
import { transition } from '../domain/charge-state.js';
import { ChargesRepository } from '../repositories/charges.repository.js';
import { ChargeEventsRepository } from '../repositories/events.repository.js';

/**
 * Atrasos y retiro por mora (spec 002, US8, RF-002-14, RN-002-07, RN-002-11, research R2 y R5).
 *
 * Por cada cobro `pendiente` con `due_at <= now` de un grupo activo y no congelado: `atrasado`
 * (por `transition('markOverdue')`), evento `atrasado` y, si la persona sigue siendo miembro
 * activo, retiro con razón `mora` en la MISMA transacción más el evento `retiro_por_mora`. Un
 * cobro `en_revision` nunca se toca. Un grupo cerrado o congelado queda quieto (R5). Cada grupo
 * va en su transacción con `pg_try_advisory_xact_lock`; si otro proceso lo tiene, se omite sin
 * esperar (ya lo está procesando).
 */
@Injectable()
export class OverdueService {
  private readonly logger = new Logger(OverdueService.name);

  constructor(
    private readonly db: DbService,
    private readonly bus: TxEventBus,
    private readonly groups: GroupsRepository,
    private readonly members: MembersRepository,
    private readonly charges: ChargesRepository,
    private readonly events: ChargeEventsRepository,
    private readonly membership: MembershipService,
  ) {}

  /**
   * Barrido de todos los grupos con atrasos pendientes (tarea `billing.overdue`). Un grupo que
   * falla no impide los demás; al final se lanza el error con la cuenta de fallos. Devuelve cuántos
   * cobros pasaron a `atrasado`.
   */
  async sweep(now: Date): Promise<number> {
    const groupIds = await this.charges.listOverdueGroupIds(this.db, now);
    let marked = 0;
    let failed = 0;
    for (const groupId of groupIds) {
      try {
        marked += await this.sweepGroup(groupId, now);
      } catch (error) {
        failed += 1;
        // Solo el id del grupo y el tipo de error: el mensaje puede traer datos personales.
        this.logger.error(
          `billing.overdue falló en el grupo ${groupId}: ${error instanceof Error ? error.name : 'error'}.`,
        );
      }
    }
    if (failed > 0) throw new Error(`billing.overdue no pudo procesar ${failed} grupo(s).`);
    return marked;
  }

  /**
   * Barre un grupo en su propia transacción. Se llama al inicio de lecturas y acciones del grupo
   * (research R2): la consulta previa es barata y, sin atrasos, no abre transacción.
   */
  async sweepGroup(groupId: string, now: Date): Promise<number> {
    if (!(await this.charges.existsOverdueInActiveGroup(this.db, now, groupId))) return 0;
    return this.db.withTransaction((tx) => this.sweepGroupTx(tx, groupId, now));
  }

  /** Igual que `sweepGroup` dentro de la transacción del llamador (acciones del titular). */
  async sweepGroupTx(tx: DbTransaction, groupId: string, now: Date): Promise<number> {
    if (!(await this.charges.existsOverdueInActiveGroup(tx, now, groupId))) return 0;
    if (!(await this.db.tryAdvisoryLock(tx, `billing.overdue:${groupId}`))) return 0;
    const group = await this.groups.findByIdForUpdate(tx, groupId);
    // R5: un grupo cerrado o congelado no marca atrasos ni retira a nadie.
    if (!group || group.status !== 'activo' || group.frozen_at !== null) return 0;

    const overdue = await this.charges.listOverdueForUpdate(tx, now, groupId);
    for (const charge of overdue) {
      const to = transition(charge.status, 'markOverdue', { now, dueAt: charge.dueAt });
      await this.charges.updateStatus(tx, charge.id, to);
      await this.events.append(tx, {
        chargeId: charge.id,
        groupId,
        type: 'atrasado',
        actorId: null,
        fromStatus: charge.status,
        toStatus: to,
        metadata: {},
        occurredAt: now,
      });
      const overdueEvent: ChargeBecameOverdue = {
        type: 'billing.charge-became-overdue',
        chargeId: charge.id,
        groupId,
        userId: charge.userId,
      };
      await this.bus.publish(tx, overdueEvent);

      const member = await this.members.findActive(tx, groupId, charge.userId);
      if (!member || member.role === 'titular') continue;
      await this.membership.removeMemberTx(tx, groupId, charge.userId, 'mora');
      await this.events.append(tx, {
        chargeId: charge.id,
        groupId,
        type: 'retiro_por_mora',
        actorId: null,
        fromStatus: to,
        toStatus: to,
        metadata: {},
        occurredAt: now,
      });
      const removedEvent: MemberRemovedForNonPayment = {
        type: 'billing.member-removed-for-non-payment',
        groupId,
        userId: charge.userId,
        chargeId: charge.id,
      };
      await this.bus.publish(tx, removedEvent);
    }
    return overdue.length;
  }

  /** Barre el grupo al que pertenece el cobro (lecturas y acciones sobre un cobro). */
  async sweepForCharge(chargeId: string, now: Date, tx?: DbTransaction): Promise<void> {
    const charge = await this.charges.findById(tx ?? this.db, chargeId);
    if (!charge) return;
    if (tx) await this.sweepGroupTx(tx, charge.groupId, now);
    else await this.sweepGroup(charge.groupId, now);
  }

  /** Barre los grupos donde la persona tiene cobros vencidos (`GET /me/charges`). */
  async sweepForUser(userId: string, now: Date): Promise<void> {
    for (const groupId of await this.charges.listOverdueGroupIds(this.db, now, userId)) {
      await this.sweepGroup(groupId, now);
    }
  }
}
