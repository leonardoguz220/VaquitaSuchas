import { Injectable, Logger } from '@nestjs/common';
import { DbService } from '../../../shared/db/db.service.js';
import type { DecisionReminderDue } from '../../../shared/events/join-request-events.js';
import { TxEventBus } from '../../../shared/events/tx-event-bus.js';
import { GroupsRepository } from '../../subscriptions/repositories/groups.repository.js';
import { computeDeadlines } from '../domain/deadlines.js';
import { RequestEventsRepository } from '../repositories/events.repository.js';
import { RequestsRepository } from '../repositories/requests.repository.js';
import { RequestLifecycle } from './request-lifecycle.js';

const BATCH_SIZE = 500;

export interface SweepResult {
  expired: number;
  reminded: number;
  failed: number;
}

/**
 * Tarea `join_requests.sweep` (spec 010, research R1, RNF-010-03): persiste los vencimientos que
 * nadie provocó y envía el recordatorio de 30 min. Es solo una limpieza: el estado efectivo ya
 * se calcula al leer y al actuar. Cada solicitud va en su propia transacción y con
 * `FOR UPDATE SKIP LOCKED`: si una acción la tiene bloqueada se omite y el siguiente tick la toma.
 * Un fallo en una solicitud no impide las demás.
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

  async sweep(now: Date): Promise<SweepResult> {
    const result: SweepResult = { expired: 0, reminded: 0, failed: 0 };
    for (const id of await this.requests.listDueIds(this.db, now, BATCH_SIZE)) {
      await this.guarded(result, async () => {
        if (await this.expireOne(id, now)) result.expired += 1;
      });
    }
    // Primero los vencimientos: una solicitud que acaba de expirar ya no recibe recordatorio.
    const reminderMs = computeDeadlines('proof', new Date(0)).reminderAt?.getTime() ?? 0;
    const uploadedBefore = new Date(now.getTime() - reminderMs);
    for (const id of await this.requests.listReminderDueIds(
      this.db,
      now,
      uploadedBefore,
      BATCH_SIZE,
    )) {
      await this.guarded(result, async () => {
        if (await this.remindOne(id, now)) result.reminded += 1;
      });
    }
    return result;
  }

  private async guarded(result: SweepResult, work: () => Promise<void>): Promise<void> {
    try {
      await work();
    } catch (error) {
      result.failed += 1;
      // Solo el tipo de error: el mensaje puede traer datos personales.
      this.logger.error(
        `join_requests.sweep falló en una solicitud: ${error instanceof Error ? error.name : 'error'}.`,
      );
    }
  }

  private expireOne(id: string, now: Date): Promise<boolean> {
    return this.db.withTransaction(async (tx) => {
      const record = await this.requests.findByIdForUpdateSkipLocked(tx, id);
      if (!record) return false;
      const after = await this.lifecycle.expireIfDue(tx, record, now);
      return record.status !== 'expirada' && after.status === 'expirada';
    });
  }

  /** Recordatorio al titular a los 30 min de la subida del comprobante, una sola vez (CA-010-14). */
  private remindOne(id: string, now: Date): Promise<boolean> {
    return this.db.withTransaction(async (tx) => {
      const record = await this.requests.findByIdForUpdateSkipLocked(tx, id);
      if (
        !record ||
        record.status !== 'pago_informado' ||
        record.reminderSentAt !== null ||
        record.proofUploadedAt === null ||
        record.decisionDeadlineAt === null ||
        record.decisionDeadlineAt.getTime() <= now.getTime()
      ) {
        return false;
      }
      const reminderAt = computeDeadlines('proof', record.proofUploadedAt).reminderAt as Date;
      if (reminderAt.getTime() > now.getTime()) return false;
      if (!(await this.requests.markReminderSent(tx, record.id, now))) return false;
      await this.events.insert(tx, {
        requestId: record.id,
        type: 'recordatorio_enviado',
        actorId: null,
        fromStatus: record.status,
        toStatus: record.status,
        occurredAt: now,
      });
      const group = await this.groups.findById(tx, record.groupId);
      const event: DecisionReminderDue = {
        type: 'join-requests.decision-reminder-due',
        requestId: record.id,
        groupId: record.groupId,
        applicantId: record.applicantId,
        hostId: group?.owner_id ?? '',
        decisionDeadlineAt: record.decisionDeadlineAt,
      };
      await this.bus.publish(tx, event);
      return true;
    });
  }
}
