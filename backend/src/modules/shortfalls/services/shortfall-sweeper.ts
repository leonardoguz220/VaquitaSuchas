import { Injectable, Logger } from '@nestjs/common';
import { DbService } from '../../../shared/db/db.service.js';
import { GroupsRepository } from '../../subscriptions/repositories/groups.repository.js';
import { transitionRow } from '../domain/state.js';
import { ShortfallsRepository } from '../repositories/shortfalls.repository.js';
import { ShortfallLifecycle, toRowState } from './shortfall-lifecycle.js';

const BATCH_SIZE = 200;

export interface ShortfallSweepResult {
  /** Filas que pasaron a devolución por plazo vencido. */
  expired: number;
  /** Rondas que se cerraron. */
  closed: number;
  failed: number;
}

/**
 * Tarea `shortfalls.sweep` (spec 011, RF-011-11 y RF-011-14, CA-011-08, 09 y 12): persiste los
 * vencimientos y cierra las rondas resueltas. Idempotente y por ronda en su propia transacción:
 * un fallo en una ronda no impide las demás. Un grupo cerrado o congelado no avanza (RF-011-07).
 */
@Injectable()
export class ShortfallSweeper {
  private readonly logger = new Logger(ShortfallSweeper.name);

  constructor(
    private readonly db: DbService,
    private readonly groups: GroupsRepository,
    private readonly repo: ShortfallsRepository,
    private readonly lifecycle: ShortfallLifecycle,
  ) {}

  async sweep(now: Date): Promise<ShortfallSweepResult> {
    const result: ShortfallSweepResult = { expired: 0, closed: 0, failed: 0 };
    for (const id of await this.repo.listSweepRoundIds(this.db, now, BATCH_SIZE)) {
      try {
        await this.sweepRound(id, now, result);
      } catch (error) {
        result.failed += 1;
        this.logger.error(
          `No se pudo procesar la ronda ${id} (${error instanceof Error ? error.name : 'error'}).`,
        );
      }
    }
    return result;
  }

  private async sweepRound(
    roundId: string,
    now: Date,
    result: ShortfallSweepResult,
  ): Promise<void> {
    const peek = await this.repo.findRound(this.db, roundId);
    if (!peek) return;
    await this.db.withTransaction(async (tx) => {
      const group = await this.groups.findByIdForUpdate(tx, peek.groupId);
      const round = await this.repo.findRound(tx, roundId, true);
      if (!group || !round || round.status !== 'abierta') return;
      if (group.status === 'cerrado' || group.frozen_at !== null) return;
      for (const row of await this.repo.listRows(tx, roundId)) {
        const state = toRowState(row);
        const ctx = {
          now,
          respondBy: round.respondBy,
          extraDeadlineAt: row.extraDeadlineAt,
          refundDueAt: row.refundDueAt,
        };
        if (state.choice === 'pendiente' && now.getTime() >= round.respondBy.getTime()) {
          const next = transitionRow(state, 'expireResponse', ctx);
          await this.lifecycle.openRefund(tx, round, row, group.owner_id, now, 'sin_respuesta', {
            choice: next.choice,
            respondedAt: now,
          });
          await this.repo.insertEvent(tx, {
            roundId,
            responseId: row.id,
            type: 'sin_respuesta',
            actorId: null,
            occurredAt: now,
          });
          result.expired += 1;
        } else if (
          state.extra === 'pendiente_pago' &&
          row.extraDeadlineAt !== null &&
          now.getTime() >= row.extraDeadlineAt.getTime()
        ) {
          const next = transitionRow(state, 'expirePayment', ctx);
          await this.lifecycle.openRefund(tx, round, row, group.owner_id, now, 'pago_vencido', {
            choice: next.choice,
            extraStatus: next.extra,
          });
          await this.repo.insertEvent(tx, {
            roundId,
            responseId: row.id,
            type: 'pago_vencido',
            actorId: null,
            occurredAt: now,
          });
          result.expired += 1;
        }
      }
      if (await this.lifecycle.closeIfResolved(tx, round, group.owner_id, now)) result.closed += 1;
    });
  }
}
