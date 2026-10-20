import type { ChargeFact } from './facts.js';
import { levelFor, type ReputationLevel } from './level.js';
import { isPunctual } from './punctuality.js';
import { currentStreak } from './streak.js';

export const MIN_CONSIDERED_FOR_RATING = 3;
export const WINDOW_MONTHS = 12;

export interface Reputation {
  consideredCount: number;
  punctualCount: number;
  lateCount: number;
  /** Medias estrellas mostradas (0–10); `null` = «Nuevo». */
  halfStars: number | null;
  level: ReputationLevel;
  currentStreak: number;
  /** Estrellas exactas con 4 decimales, p. ej. `4.3750`; `null` sin cobros considerados. */
  exactStars: string | null;
}

/** Inicio de la ventana de 12 meses de calendario hacia atrás desde `now`. */
export function windowStart(now: Date): Date {
  const start = new Date(now.getTime());
  start.setUTCMonth(start.getUTCMonth() - WINDOW_MONTHS);
  return start;
}

/**
 * ¿Cuenta para la calificación? (RN-007-01, RN-007-09): origen `ciclo`, `pagado` o `atrasado`,
 * vencimiento dentro de los últimos 12 meses, no excluido y, si el grupo está congelado por
 * baneo, solo si ya estaba `pagado`.
 */
export function isConsidered(fact: ChargeFact, now: Date): boolean {
  if (fact.origin !== 'ciclo' || fact.excluded) return false;
  if (fact.status !== 'pagado' && fact.status !== 'atrasado') return false;
  if (fact.dueAt.getTime() < windowStart(now).getTime()) return false;
  if (fact.groupFrozenByBan && fact.status !== 'pagado') return false;
  return true;
}

/** Texto de las estrellas exactas con 4 decimales, en enteros (sin `float`). */
export function exactStarsText(punctual: number, considered: number): string | null {
  if (considered === 0) return null;
  const scaled = Math.floor((100_000 * punctual + considered) / (2 * considered));
  return `${Math.floor(scaled / 10_000)}.${String(scaled % 10_000).padStart(4, '0')}`;
}

/** Calificación de una persona a partir de sus cobros (RN-007-03); nunca divide entre cero. */
export function computeReputation(facts: readonly ChargeFact[], now: Date): Reputation {
  const considered = facts.filter((fact) => isConsidered(fact, now));
  const punctualFacts = considered.filter(isPunctual);
  const c = considered.length;
  const p = punctualFacts.length;
  const streak = currentStreak(
    considered.map((fact) => ({ dueAt: fact.dueAt, punctual: isPunctual(fact) })),
  );
  const base = {
    consideredCount: c,
    punctualCount: p,
    lateCount: c - p,
    currentStreak: streak,
    exactStars: exactStarsText(p, c),
  };
  if (c < MIN_CONSIDERED_FOR_RATING) return { ...base, halfStars: null, level: 'Nuevo' };
  // 10p/c medias estrellas redondeadas con la mitad hacia arriba, en enteros.
  const halfStars = Math.floor((20 * p + c) / (2 * c));
  return { ...base, halfStars, level: levelFor(halfStars) };
}
