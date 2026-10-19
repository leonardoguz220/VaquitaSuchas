import { startOfLaPazDay, toLaPazParts } from '../../../shared/domain/la-paz.js';
import { lastCutAtOrBefore, nextCutAfter } from './billing-calendar.js';

export const DEFAULT_ENTRY_WINDOW_DAYS = 3;

export interface EntryWindowGroup {
  billingDay: number;
  createdAt: Date;
}

export interface EntryWindow {
  isOpen: boolean;
  /** Inicio de la última ventana (corte regular o creación del grupo). */
  start: Date;
  /** Fin exclusivo: inicio del día siguiente al último día de la ventana (corte + windowDays incluido). */
  endExclusive: Date;
  /** Próxima apertura (próximo corte); null si la ventana está abierta. */
  opensAt: Date | null;
  /** Último instante de la ventana abierta (23:59:59 del último día); null si está cerrada. */
  closesAt: Date | null;
}

const windowEnd = (start: Date, windowDays: number): Date => {
  const p = toLaPazParts(start);
  return startOfLaPazDay(p.year, p.month, p.day + windowDays + 1);
};

/**
 * Ventana de ingreso (RF-001-22): `[último corte, inicio del día (fecha del corte + windowDays))`.
 * La creación cuenta como corte inicial: un grupo nuevo abre su ventana al crearse, y si un corte
 * regular cae dentro de ella, la ventana sigue abierta hasta el fin de la más tardía.
 */
export function entryWindow(
  group: EntryWindowGroup,
  now: Date,
  windowDays = DEFAULT_ENTRY_WINDOW_DAYS,
): EntryWindow {
  const t = now.getTime();
  const lastCut = lastCutAtOrBefore(now, group.billingDay, group.createdAt);
  let start = lastCut;
  let endExclusive = windowEnd(lastCut, windowDays);
  const initialEnd = windowEnd(group.createdAt, windowDays);
  if (
    lastCut.getTime() > group.createdAt.getTime() &&
    t >= group.createdAt.getTime() &&
    t < initialEnd.getTime()
  ) {
    start = group.createdAt;
    endExclusive = new Date(Math.max(endExclusive.getTime(), initialEnd.getTime()));
  }
  const isOpen = t >= start.getTime() && t < endExclusive.getTime();
  const next = nextCutAfter(now, group.billingDay);
  return {
    isOpen,
    start,
    endExclusive,
    opensAt: isOpen ? null : startOfLaPazDay(next.year, next.month, next.day),
    closesAt: isOpen ? new Date(endExclusive.getTime() - 1000) : null,
  };
}
