import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DbService } from '../../../shared/db/db.service.js';
import { toLaPazParts } from '../../../shared/domain/la-paz.js';
import { JobRunsRepository } from '../../../shared/jobs/job-runs.repository.js';
import { splitShares } from '../../subscriptions/domain/shares.js';
import {
  dueScheduledNotices,
  parseScheduleConfig,
  type ScheduleCharge,
  type ScheduleConfig,
  type ScheduledNotice,
} from '../domain/schedule-rules.js';
import {
  ScheduleRepository,
  type ScheduleChargeRow,
  type ScheduleGroupRow,
} from '../repositories/schedule.repository.js';
import { NotificationService } from './notification.service.js';

/** Marca en `job_runs` de que la parte diaria ya corrió bien hoy (hora de La Paz). */
export const DAILY_MARKER_JOB = 'notifications.schedule.daily';
export const DAILY_START_HOUR = 8;

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

const sameLaPazDay = (a: Date, b: Date): boolean => {
  const x = toLaPazParts(a);
  const y = toLaPazParts(b);
  return x.year === y.year && x.month === y.month && x.day === y.day;
};

/**
 * Tarea `notifications.schedule` (RF-005-19, RN-005-01, RN-005-02). En cada tick:
 * - la parte diaria (aviso previo y recordatorio de vencimiento) solo actúa desde las 08:00 de La
 *   Paz y si aún no hay una ejecución correcta hoy; mira el estado de la base, no solo el reloj,
 *   así recupera lo que falte tras una caída;
 * - la parte de 48 h en revisión corre en cada tick.
 * Todo con `dedupe_key`: repetirla no duplica avisos (CA-005-10). Cada aviso va en su propia
 * transacción; si alguno falla los demás se procesan y la ejecución queda en error.
 */
@Injectable()
export class ScheduleService {
  private readonly logger = new Logger(ScheduleService.name);
  private readonly config: ScheduleConfig;

  constructor(
    private readonly db: DbService,
    private readonly repository: ScheduleRepository,
    private readonly notifications: NotificationService,
    private readonly runs: JobRunsRepository,
    configService: ConfigService,
  ) {
    this.config = parseScheduleConfig({
      NOTICE_PREVIEW_DAYS: configService.get<string>('NOTICE_PREVIEW_DAYS'),
      NOTICE_DUE_REMINDER_DAYS: configService.get<string>('NOTICE_DUE_REMINDER_DAYS'),
      NOTICE_REVIEW_HOURS: configService.get<string>('NOTICE_REVIEW_HOURS'),
    });
  }

  /** Devuelve cuántos avisos nuevos creó. */
  async run(now: Date): Promise<number> {
    let created = 0;
    let failed = 0;

    const runDaily = await this.shouldRunDaily(now);
    const groups = runDaily ? await this.repository.activeGroups(this.db) : [];
    const pending = runDaily
      ? await this.repository.chargesPendingDueWithin(
          this.db,
          now,
          this.config.dueReminderDaysBefore * MS_PER_DAY,
        )
      : [];
    const review = await this.repository.chargesInReviewOlderThan(
      this.db,
      now,
      this.config.reviewReminderHours * MS_PER_HOUR,
    );

    const groupById = new Map<string, ScheduleGroupRow>(groups.map((g) => [g.id, g]));
    const chargeById = new Map<string, ScheduleChargeRow>(
      [...pending, ...review].map((c) => [c.id, c]),
    );
    const notices = dueScheduledNotices(
      groups.map((g) => ({ id: g.id, billingDay: g.billingDay, memberIds: g.memberIds })),
      [...pending, ...review].map((c): ScheduleCharge => ({
        id: c.id,
        groupId: c.groupId,
        userId: c.userId,
        ownerId: c.ownerId,
        status: c.status,
        dueAt: c.dueAt,
        receipt: c.receipt,
      })),
      now,
      this.config,
    );

    for (const notice of notices) {
      try {
        const made = await this.db.withTransaction((tx) =>
          this.create(tx, notice, groupById, chargeById),
        );
        if (made) created += 1;
      } catch (error) {
        failed += 1;
        // Sin datos personales: solo el tipo de aviso y de error.
        this.logger.error(
          `notifications.schedule falló en un aviso ${notice.type}: ${error instanceof Error ? error.name : 'error'}.`,
        );
      }
    }

    if (failed > 0) {
      throw new Error(`notifications.schedule no pudo crear ${failed} aviso(s).`);
    }
    if (runDaily) await this.markDailyDone(now);
    return created;
  }

  private async shouldRunDaily(now: Date): Promise<boolean> {
    if (toLaPazParts(now).hour < DAILY_START_HOUR) return false;
    const last = await this.runs.findLastOkStartedAt(DAILY_MARKER_JOB);
    return last === null || !sameLaPazDay(last, now);
  }

  private async markDailyDone(now: Date): Promise<void> {
    const id = await this.runs.insertRunning(DAILY_MARKER_JOB, 'cron', now);
    await this.runs.finish(id, { status: 'ok', processedCount: 0 }, now);
  }

  private create(
    tx: Parameters<NotificationService['notify']>[0],
    notice: ScheduledNotice,
    groups: ReadonlyMap<string, ScheduleGroupRow>,
    charges: ReadonlyMap<string, ScheduleChargeRow>,
  ): Promise<boolean> {
    switch (notice.type) {
      case 'aviso_previo': {
        const group = groups.get(notice.groupId);
        if (!group) return Promise.resolve(false);
        // RN-005-05: la cuota vigente al momento del aviso, indicada como «estimado».
        const { baseShareCents } = splitShares(group.totalBsCents, group.memberCount);
        return this.notifications.notify(tx, {
          userId: notice.userId,
          type: 'aviso_previo',
          entity: { type: 'group', id: group.id },
          period: notice.period,
          data: { groupName: group.name, groupId: group.id, amountCents: baseShareCents },
        });
      }
      case 'recordatorio_vencimiento': {
        const charge = charges.get(notice.chargeId);
        if (!charge) return Promise.resolve(false);
        return this.notifications.notify(tx, {
          userId: notice.userId,
          type: 'recordatorio_vencimiento',
          entity: { type: 'charge', id: charge.id },
          data: {
            groupName: charge.groupName,
            chargeId: charge.id,
            amountCents: charge.amountCents,
            dueAt: charge.dueAt,
          },
        });
      }
      case 'comprobante_pendiente_48h': {
        const charge = charges.get(notice.chargeId);
        if (!charge?.receipt) return Promise.resolve(false);
        return this.notifications.notify(tx, {
          userId: notice.userId,
          type: 'comprobante_pendiente_48h',
          entity: { type: 'charge', id: charge.id },
          // Un comprobante nuevo (reemplazo) es otra espera: un solo recordatorio por comprobante.
          period: notice.receiptId,
          data: {
            groupName: charge.groupName,
            chargeId: charge.id,
            personName: charge.memberName,
            dueAt: charge.receipt.uploadedAt,
          },
        });
      }
    }
  }
}
