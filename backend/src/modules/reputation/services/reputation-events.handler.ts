import { Injectable } from '@nestjs/common';
import { Clock } from '../../../shared/clock/clock.js';
import type { DbTransaction } from '../../../shared/db/db.service.js';
import type {
  ChargeBecameOverdue,
  ChargeCancelled,
  ChargeConfirmed,
} from '../../../shared/events/charge-events.js';
import type { GroupFrozen } from '../../../shared/events/group-events.js';
import type { UserBanned } from '../../../shared/events/user-events.js';
import { ReputationRepository } from '../repositories/reputation.repository.js';
import { ReputationService } from './reputation.service.js';

/** Recalcula la calificación en la misma transacción del hecho que la cambia (RF-007-05, CA-007-15). */
@Injectable()
export class ReputationEventsHandler {
  constructor(
    private readonly clock: Clock,
    private readonly reputation: ReputationService,
    private readonly repository: ReputationRepository,
  ) {}

  async onChargeChanged(
    tx: DbTransaction,
    event: ChargeConfirmed | ChargeBecameOverdue | ChargeCancelled,
  ): Promise<void> {
    await this.reputation.recomputeUser(tx, event.userId, this.clock.now());
  }

  async onUserBanned(tx: DbTransaction, event: UserBanned): Promise<void> {
    await this.reputation.recomputeUser(tx, event.userId, this.clock.now());
  }

  /** Un grupo congelado por baneo deja de contar sus cobros no pagados (RN-007-01). */
  async onGroupFrozen(tx: DbTransaction, event: GroupFrozen): Promise<void> {
    const now = this.clock.now();
    for (const userId of await this.repository.userIdsWithChargesInGroup(tx, event.groupId)) {
      await this.reputation.recomputeUser(tx, userId, now);
    }
  }
}
