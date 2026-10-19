import { Injectable } from '@nestjs/common';
import type { DbTransaction } from '../../../shared/db/db.service.js';
import { toLaPazParts } from '../../../shared/domain/la-paz.js';
import type { ChargeGenerated } from '../../../shared/events/charge-events.js';
import type {
  GroupCreated,
  MemberAdded,
  MemberRemoved,
} from '../../../shared/events/group-events.js';
import { TxEventBus } from '../../../shared/events/tx-event-bus.js';
import {
  lastCutAtOrBefore,
  periodOf,
  type LaPazDate,
} from '../../subscriptions/domain/billing-calendar.js';
import { splitShares } from '../../subscriptions/domain/shares.js';
import {
  GroupsRepository,
  type GroupRow,
} from '../../subscriptions/repositories/groups.repository.js';
import { MembersRepository } from '../../subscriptions/repositories/members.repository.js';
import { buildCycle, chargeFromCycle, type CycleGroupInput } from '../domain/cycle-calculation.js';
import { missedPeriods } from '../domain/missed-periods.js';
import { ChargesRepository } from '../repositories/charges.repository.js';
import { CyclesRepository } from '../repositories/cycles.repository.js';

/** Resultado de generar el ciclo de un grupo; `null` si no había nada que generar. */
export interface GeneratedCycle {
  cycleId: string;
  period: string;
  chargeCount: number;
  /** Períodos sin ciclo entre el último existente y este (caída larga, research R1). */
  missedPeriods: number;
}

const toCycleInput = (group: GroupRow): CycleGroupInput => ({
  ownerId: group.owner_id,
  priceCents: Number(group.price_cents),
  currency: group.currency,
  exchangeRate: group.exchange_rate,
});

const toLaPazDate = (instant: Date): LaPazDate => {
  const { year, month, day } = toLaPazParts(instant);
  return { year, month, day };
};

/**
 * Ciclos y generación automática de cobros (spec 002, RF-002-01, RF-002-02, RF-002-04,
 * RF-002-05, RN-002-09). Todos los métodos reciben la transacción del llamador (la tarea
 * `billing.generate`, la spec 010 o el bus de eventos) y no abren otra.
 */
@Injectable()
export class BillingCyclesService {
  constructor(
    private readonly groups: GroupsRepository,
    private readonly members: MembersRepository,
    private readonly cycles: CyclesRepository,
    private readonly charges: ChargesRepository,
    private readonly bus: TxEventBus,
  ) {}

  /**
   * Garantiza el ciclo del último corte regular `<= now` (idempotente y recuperable, CA-002-22).
   * Bloquea el grupo con `FOR UPDATE`, así que llamadas simultáneas se serializan y las
   * siguientes no encuentran nada que hacer (CA-002-02). No genera si el grupo está cerrado o
   * congelado (R5), si aún no hubo un corte posterior a la creación o si el período ya tiene
   * ciclo, incluido el `inicial` del mismo mes (spec 001 research R1).
   */
  async ensureCurrentCycle(
    tx: DbTransaction,
    groupId: string,
    now: Date,
  ): Promise<GeneratedCycle | null> {
    const group = await this.groups.findByIdForUpdate(tx, groupId);
    if (!group || group.status !== 'activo' || group.frozen_at !== null) return null;

    const cutInstant = lastCutAtOrBefore(now, group.billing_day, group.created_at);
    // Sin corte regular posterior a la creación: la creación misma es el corte inicial.
    if (cutInstant.getTime() <= group.created_at.getTime()) return null;
    const cutDate = toLaPazDate(cutInstant);
    const period = periodOf(cutDate);
    if (await this.cycles.findByGroupAndPeriod(tx, groupId, period)) return null;

    const latest = await this.cycles.findLatest(tx, groupId);
    const active = await this.members.listActive(tx, groupId);
    const cycle = await this.cycles.insert(
      tx,
      groupId,
      buildCycle(toCycleInput(group), active.length, cutDate, now, 'regular'),
    );
    if (!cycle) return null;

    let chargeCount = 0;
    for (const member of active) {
      if (member.user_id === group.owner_id) continue;
      const charge = await this.charges.insertFromCycle(
        tx,
        groupId,
        cycle.id,
        chargeFromCycle(cycle, member.user_id, now),
      );
      if (!charge) continue;
      chargeCount += 1;
      const event: ChargeGenerated = {
        type: 'billing.charge-generated',
        chargeId: charge.id,
        groupId,
        userId: charge.userId,
        period: charge.period,
        amountCents: charge.amountCents,
        dueAt: charge.dueAt,
      };
      await this.bus.publish(tx, event);
    }

    // Con el primer ciclo regular el inicial deja de recalcularse (spec 001 research R1).
    const initial = await this.cycles.findInitial(tx, groupId);
    if (initial && initial.finalizedAt === null) {
      await this.cycles.finalizeInitial(tx, initial.id, now);
    }

    return {
      cycleId: cycle.id,
      period,
      chargeCount,
      missedPeriods: latest ? missedPeriods(latest.period, period) : 0,
    };
  }

  /** `GroupCreated`: ciclo inicial con las cuotas de un solo miembro y sin cobros (RF-002-04). */
  async onGroupCreated(tx: DbTransaction, event: GroupCreated): Promise<void> {
    const group = await this.groups.findById(tx, event.groupId);
    if (!group) return;
    await this.cycles.insert(
      tx,
      group.id,
      buildCycle(
        toCycleInput(group),
        1,
        toLaPazDate(group.created_at),
        group.created_at,
        'inicial',
      ),
    );
  }

  /** `MemberAdded`: recalcula las cuotas del ciclo inicial mientras siga abierto. */
  async onMemberAdded(tx: DbTransaction, event: MemberAdded): Promise<void> {
    await this.recalculateInitial(tx, event.groupId);
  }

  /** `MemberRemoved`: igual que el ingreso. */
  async onMemberRemoved(tx: DbTransaction, event: MemberRemoved): Promise<void> {
    await this.recalculateInitial(tx, event.groupId);
  }

  private async recalculateInitial(tx: DbTransaction, groupId: string): Promise<void> {
    const initial = await this.cycles.findInitial(tx, groupId);
    if (!initial || initial.finalizedAt !== null) return;
    const memberCount = Math.max(1, await this.members.countActive(tx, groupId));
    const shares = splitShares(initial.totalBsCents, memberCount);
    await this.cycles.updateOpenInitialShares(tx, initial.id, { memberCount, ...shares });
  }
}
