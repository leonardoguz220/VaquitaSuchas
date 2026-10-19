import { Injectable, Logger } from '@nestjs/common';
import { DbService, type DbTransaction } from '../../../shared/db/db.service.js';
import type { DecisionReminderDue } from '../../../shared/events/join-request-events.js';
import { TxEventBus } from '../../../shared/events/tx-event-bus.js';
import { GroupsRepository } from '../../subscriptions/repositories/groups.repository.js';
import { DEFAULT_DEADLINE_CONFIG } from '../domain/deadlines.js';
import { RequestEventsRepository } from '../repositories/events.repository.js';
import { RequestsRepository } from '../repositories/requests.repository.js';
import { RequestLifecycle } from './request-lifecycle.js';

const BATCH_SIZE = 500;
const MINUTE_MS = 60_000;

/**
 * Barrido de plazos (RF-010-14, RF-010-19, RNF-010-03): persiste los vencimientos de las
 * solicitudes activas y emite una sola vez el recordatorio de 30 minutos al titular. Cada
 * solicitud va en su transacción y se salta si otra la tiene bloqueada. Es idempotente: decide
 * por el estado de la base. Si alguna falla, el resto se procesa y la tarea queda en `error`.
 */
@Injectable()
export class RequestSweeper {
  private readonly logger = new Logger(RequestSweeper.name);

  constructor(
    private readonly db: DbService,
    private readonly requests: RequestsRepository,
    private readonly events: RequestEventsRepository,
    private readonly groups: GroupsRepository,
    private readonly lifecycle: RequestLifecycle,
    private readonly bus: TxEventBus,
  ) {}

  /** Devuelve cuántas solicitudes expiró o recordó. */
  async sweep(now: Date): Promise<number> {
    const ids = await this.requests.listSweepCandidateIds(
      this.db,
      now,
      DEFAULT_DEADLINE_CONFIG.reminderMinutes,
      BATCH_SIZE,
    );
    let processed = 0;
    let failed = 0;
    for (const id of ids) {
      try {
        processed += await this.db.withTransaction((tx) => this.sweepOne(tx, id, now));
      } catch (error) {
        failed += 1;
        this.logger.error(
          `join-requests.sweep falló en una solicitud: ${error instanceof Error ? error.name : 'error'}.`,
        );
      }
    }
    if (failed > 0)
      throw new Error(`join-requests.sweep no pudo procesar ${failed} solicitud(es).`);
    return processed;
  }

  private async sweepOne(tx: DbTransaction, id: string, now: Date): Promise<number> {
    const locked = await this.requests.findByIdForSweep(tx, id);
    if (locked === null) return 0;
    const record = await this.lifecycle.expireIfDue(tx, locked, now);
    if (record.status === 'expirada') return locked.status === 'expirada' ? 0 : 1;
    const dueAt = record.decisionDeadlineAt;
    const remindAt =
      dueAt === null ? null : dueAt.getTime() - DEFAULT_DEADLINE_CONFIG.reminderMinutes * MINUTE_MS;
    if (
      record.status !== 'pago_informado' ||
      record.reminderSentAt !== null ||
      dueAt === null ||
      remindAt === null ||
      now.getTime() < remindAt
    ) {
      return 0;
    }
    if (!(await this.requests.markReminderSent(tx, id, now))) return 0;
    await this.events.insert(tx, {
      requestId: id,
      type: 'recordatorio_enviado',
      actorId: null,
      fromStatus: 'pago_informado',
      toStatus: 'pago_informado',
      occurredAt: now,
    });
    const group = await this.groups.findById(tx, record.groupId);
    const event: DecisionReminderDue = {
      type: 'join-requests.decision-reminder-due',
      requestId: id,
      groupId: record.groupId,
      applicantId: record.applicantId,
      hostId: group?.owner_id ?? '',
      decisionDeadlineAt: dueAt,
    };
    await this.bus.publish(tx, event);
    return 1;
  }
}
