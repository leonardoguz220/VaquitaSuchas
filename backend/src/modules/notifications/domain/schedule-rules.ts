import { toLaPazParts } from '../../../shared/domain/la-paz.js';
import { cutDateFor, type LaPazDate } from '../../subscriptions/domain/billing-calendar.js';

// Avisos programados (spec 005, RF-005-04, RF-005-06, RF-005-11, RN-005-05, RN-005-06). Funciones
// puras: reciben el instante `now` y devuelven qué avisos corresponden; no escriben nada. Repetir
// la llamada devuelve lo mismo, y la base evita duplicados con `dedupe_key` (RNF-005-01).

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

/** Parámetros de configuración (RN-005-06) con los valores por defecto de la spec. */
export interface ScheduleConfig {
  /** Días antes del corte para el aviso previo. */
  previewDaysBefore: number;
  /** Días antes del vencimiento para el recordatorio. */
  dueReminderDaysBefore: number;
  /** Horas en revisión tras las cuales se recuerda al titular. */
  reviewReminderHours: number;
}

export const DEFAULT_SCHEDULE_CONFIG: ScheduleConfig = {
  previewDaysBefore: 2,
  dueReminderDaysBefore: 1,
  reviewReminderHours: 48,
};

const positiveInt = (raw: string | undefined, fallback: number): number => {
  if (raw === undefined || !/^\d+$/.test(raw.trim())) return fallback;
  const value = Number(raw.trim());
  return Number.isSafeInteger(value) && value >= 1 ? value : fallback;
};

/** Lee los parámetros de variables de entorno opcionales; un valor inválido usa el por defecto. */
export function parseScheduleConfig(env: Record<string, string | undefined>): ScheduleConfig {
  return {
    previewDaysBefore: positiveInt(
      env['NOTICE_PREVIEW_DAYS'],
      DEFAULT_SCHEDULE_CONFIG.previewDaysBefore,
    ),
    dueReminderDaysBefore: positiveInt(
      env['NOTICE_DUE_REMINDER_DAYS'],
      DEFAULT_SCHEDULE_CONFIG.dueReminderDaysBefore,
    ),
    reviewReminderHours: positiveInt(
      env['NOTICE_REVIEW_HOURS'],
      DEFAULT_SCHEDULE_CONFIG.reviewReminderHours,
    ),
  };
}

export interface ScheduleGroup {
  id: string;
  billingDay: number;
  /** Miembros activos sin el titular (RN-005-03: el titular no recibe avisos de cobro). */
  memberIds: readonly string[];
}

export interface ScheduleCharge {
  id: string;
  groupId: string;
  userId: string;
  ownerId: string;
  status: 'pendiente' | 'en_revision' | 'pagado' | 'atrasado' | 'cancelado';
  dueAt: Date;
  /** Comprobante vigente y cuándo se subió; solo para cobros en revisión. */
  receipt: { id: string; uploadedAt: Date } | null;
}

export type ScheduledNotice =
  | { type: 'aviso_previo'; userId: string; groupId: string; period: string; cutDate: LaPazDate }
  | { type: 'recordatorio_vencimiento'; userId: string; groupId: string; chargeId: string }
  | {
      type: 'comprobante_pendiente_48h';
      userId: string;
      groupId: string;
      chargeId: string;
      memberId: string;
      receiptId: string;
    };

const ymd = (d: LaPazDate): number => d.year * 10_000 + d.month * 100 + d.day;

function shiftDays(date: LaPazDate, days: number): LaPazDate {
  const d = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/**
 * Corte del grupo cuyo aviso previo corresponde hoy (hora de La Paz): desde `corte − N días` y
 * hasta el día anterior al corte. Mirar hasta el día del corte (no solo el día exacto) recupera el
 * aviso si el servicio estuvo caído (RF-005-19).
 */
export function previewCutFor(
  now: Date,
  billingDay: number,
  previewDaysBefore: number,
): LaPazDate | null {
  const today = toLaPazParts(now);
  const todayKey = ymd(today);
  for (let delta = 0; delta <= 1; delta++) {
    const index = today.year * 12 + (today.month - 1) + delta;
    const cut = cutDateFor(Math.floor(index / 12), (index % 12) + 1, billingDay);
    if (ymd(shiftDays(cut, -previewDaysBefore)) <= todayKey && todayKey < ymd(cut)) return cut;
  }
  return null;
}

/**
 * Avisos que corresponden en `now` (CA-005-02, CA-005-03, CA-005-04, CA-005-06, CA-005-08):
 * - aviso previo a cada miembro, desde corte − 2 días;
 * - recordatorio de vencimiento si el cobro sigue `pendiente` (un cobro `atrasado`, `pagado` o
 *   `cancelado` no genera recordatorio: tras el retiro por mora no se insiste, RF-005-07);
 * - recordatorio al titular de un comprobante con más de 48 horas en revisión.
 */
export function dueScheduledNotices(
  groups: readonly ScheduleGroup[],
  charges: readonly ScheduleCharge[],
  now: Date,
  config: ScheduleConfig = DEFAULT_SCHEDULE_CONFIG,
): ScheduledNotice[] {
  const notices: ScheduledNotice[] = [];

  for (const group of groups) {
    const cut = previewCutFor(now, group.billingDay, config.previewDaysBefore);
    if (!cut) continue;
    const period = `${String(cut.year).padStart(4, '0')}-${String(cut.month).padStart(2, '0')}`;
    for (const userId of group.memberIds) {
      notices.push({ type: 'aviso_previo', userId, groupId: group.id, period, cutDate: cut });
    }
  }

  const nowMs = now.getTime();
  for (const charge of charges) {
    if (charge.userId === charge.ownerId) continue;
    if (charge.status === 'pendiente') {
      const dueMs = charge.dueAt.getTime();
      if (nowMs < dueMs && nowMs >= dueMs - config.dueReminderDaysBefore * MS_PER_DAY) {
        notices.push({
          type: 'recordatorio_vencimiento',
          userId: charge.userId,
          groupId: charge.groupId,
          chargeId: charge.id,
        });
      }
    } else if (charge.status === 'en_revision' && charge.receipt) {
      if (nowMs - charge.receipt.uploadedAt.getTime() >= config.reviewReminderHours * MS_PER_HOUR) {
        notices.push({
          type: 'comprobante_pendiente_48h',
          userId: charge.ownerId,
          groupId: charge.groupId,
          chargeId: charge.id,
          memberId: charge.userId,
          receiptId: charge.receipt.id,
        });
      }
    }
  }
  return notices;
}
