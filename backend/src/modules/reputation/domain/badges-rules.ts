import type { ChargeFact } from './facts.js';
import { isConsidered } from './score.js';
import { isPunctual } from './punctuality.js';
import { currentStreak } from './streak.js';

export type BadgeCode = 'primer_pago' | 'racha_3' | 'racha_6' | 'racha_12' | 'sin_atrasos_6m';

export interface BadgeDefinition {
  code: BadgeCode;
  name: string;
  description: string;
  condition: string;
  /** Avance necesario para obtenerla. */
  target: number;
}

/**
 * Catálogo versionado (RN-007-07, RF-007-06). «Grupo completo» queda fuera: depende de los pagos
 * de otras personas y la reputación de alguien nunca se calcula con datos ajenos (RN-007-08).
 */
export const BADGES: readonly BadgeDefinition[] = [
  {
    code: 'primer_pago',
    name: 'Primer pago',
    description: 'Pagaste tu primer cobro a tiempo.',
    condition: 'Un cobro pagado antes del vencimiento.',
    target: 1,
  },
  {
    code: 'racha_3',
    name: 'Racha 3',
    description: 'Tres pagos puntuales seguidos.',
    condition: '3 cobros puntuales consecutivos.',
    target: 3,
  },
  {
    code: 'racha_6',
    name: 'Racha 6',
    description: 'Seis pagos puntuales seguidos.',
    condition: '6 cobros puntuales consecutivos.',
    target: 6,
  },
  {
    code: 'racha_12',
    name: 'Racha 12',
    description: 'Doce pagos puntuales seguidos.',
    condition: '12 cobros puntuales consecutivos.',
    target: 12,
  },
  {
    code: 'sin_atrasos_6m',
    name: 'Sin atrasos 6 meses',
    description: 'Seis meses sin un solo atraso.',
    condition: 'Al menos 3 cobros en los últimos 6 meses y ninguno tardío.',
    target: 3,
  },
];

const SIX_MONTHS = 6;

function sixMonthsAgo(now: Date): Date {
  const start = new Date(now.getTime());
  start.setUTCMonth(start.getUTCMonth() - SIX_MONTHS);
  return start;
}

/** Avance actual hacia una insignia, acotado al objetivo (se calcula al consultar, no se guarda). */
export function badgeProgress(code: BadgeCode, facts: readonly ChargeFact[], now: Date): number {
  const considered = facts.filter((fact) => isConsidered(fact, now));
  const definition = BADGES.find((badge) => badge.code === code) as BadgeDefinition;
  let current = 0;
  switch (code) {
    case 'primer_pago':
      current = considered.filter(isPunctual).length;
      break;
    case 'racha_3':
    case 'racha_6':
    case 'racha_12':
      current = currentStreak(
        considered.map((fact) => ({ dueAt: fact.dueAt, punctual: isPunctual(fact) })),
      );
      break;
    case 'sin_atrasos_6m': {
      const recent = considered.filter(
        (fact) => fact.dueAt.getTime() >= sixMonthsAgo(now).getTime(),
      );
      current = recent.some((fact) => !isPunctual(fact)) ? 0 : recent.length;
      break;
    }
  }
  return Math.min(current, definition.target);
}

/** Insignias que se ganan ahora y aún no se tenían; una obtenida se conserva siempre (RF-007-08). */
export function badgesEarned(
  facts: readonly ChargeFact[],
  existing: ReadonlySet<string>,
  now: Date,
): BadgeCode[] {
  return BADGES.filter(
    (badge) => !existing.has(badge.code) && badgeProgress(badge.code, facts, now) >= badge.target,
  ).map((badge) => badge.code);
}
