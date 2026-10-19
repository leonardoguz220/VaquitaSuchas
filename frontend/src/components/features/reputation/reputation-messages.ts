/**
 * Textos y mapeos de la pantalla «Mi reputación» (spec 007, plan §6). Ningún texto decide un
 * estado: los niveles, las estrellas y la habilitación salen de la API tal como llegan.
 */
import type { BadgeTone } from '@/components/ui';
import { formatDateLaPaz, formatPeriod } from '@/lib/dates';
import { isConnectionError, type ApiError } from '@/services/http';
import type {
  HostEligibilityStatus,
  RatingLevel,
  RecentResult,
  ReputationDetail,
} from '@/services/reputation';

export const REPUTATION_MESSAGES = {
  title: 'Mi reputación',
  intro: 'Qué tan puntual has sido pagando tus cobros y si puedes ser titular.',
  loadFailed: 'No pudimos cargar tu reputación.',
  offlineTitle: 'Sin conexión.',
  offline: 'Revisa tu internet y vuelve a intentarlo.',
  unexpected: 'Ocurrió un error inesperado. Inténtalo de nuevo.',
  retry: 'Reintentar',
  backToProfile: 'Volver a mi perfil',
  loading: 'Cargando tu reputación…',
  ratingTitle: 'Tu calificación',
  newRating: 'Todavía no tienes calificación.',
  notCounted: 'No cuenta para tu calificación',
  recentTitle: 'Últimos cobros',
  recentEmpty: 'Todavía no tienes cobros para mostrar.',
  dueLabel: 'Vencía el',
  formulaTitle: '¿Cómo se calcula?',
  hostTitle: 'Habilitación como titular',
  hostEligible: 'Estás habilitado para crear suscripciones.',
  hostBySource: 'Un administrador te habilitó como titular.',
  hostNotEligible: 'Todavía no puedes crear suscripciones.',
  hostOtherOption: 'Otra opción: que un administrador te habilite como titular.',
} as const;

/** Cobros considerados para tener calificación: con menos, el nivel es «Nuevo» (contrato 007). */
export const NEW_RATING_MIN_CHARGES = 3;

/** Número con coma decimal, como «4,5». */
export function formatDecimal(value: number): string {
  return String(value).replace('.', ',');
}

/** Tono de cada nivel: el color acompaña al texto y al ícono de la insignia. */
export function levelTone(level: RatingLevel | string): BadgeTone {
  switch (level) {
    case 'Excelente':
    case 'Bueno':
      return 'success';
    case 'Regular':
      return 'warning';
    case 'En riesgo':
      return 'danger';
    default:
      return 'neutral';
  }
}

export const RECENT_RESULT_LABEL: Record<RecentResult, string> = {
  puntual: 'Puntual',
  tardio: 'Tardío',
};

export const RECENT_RESULT_TONE: Record<RecentResult, BadgeTone> = {
  puntual: 'success',
  tardio: 'danger',
};

/** Cuántos cobros faltan para salir de «Nuevo», con el número que entrega la API. */
export function chargesMissingForRating(consideredCount: number): number {
  return Math.max(0, NEW_RATING_MIN_CHARGES - consideredCount);
}

function chargesText(count: number): string {
  return `${count} ${count === 1 ? 'cobro considerado' : 'cobros considerados'}`;
}

/** Líneas de lo que falta para ser titular, construidas desde `missing` (CA-007-20). */
export function hostMissingLines(host: HostEligibilityStatus, consideredCount: number): string[] {
  const lines: string[] = [];
  if (host.missing.includes('stars')) {
    lines.push(`Necesitas ${formatDecimal(host.minStars)} estrellas`);
  }
  if (host.missing.includes('charges')) {
    const remaining = host.minConsideredCharges - consideredCount;
    lines.push(
      remaining > 0
        ? `Te faltan ${chargesText(remaining)}`
        : `Necesitas ${host.minConsideredCharges} cobros considerados`,
    );
  }
  return lines;
}

/** Texto de la habilitación por calificación: lo que tiene y lo que se pide (CA-007-20). */
export function hostEligibleText(detail: ReputationDetail): string {
  const { host, starsLabel, consideredCount } = detail;
  const has = starsLabel ?? 'sin estrellas';
  return `Tienes ${has} con ${consideredCount} cobros considerados. Se piden ${formatDecimal(host.minStars)} y al menos ${host.minConsideredCharges}.`;
}

/** Período `YYYY-MM` en texto, o el valor tal cual si no tiene ese formato. */
export function periodText(period: string): string {
  try {
    return formatPeriod(period);
  } catch {
    return period;
  }
}

/** Fecha de vencimiento en La Paz, o un guion si no es una fecha válida. */
export function dueText(dueAt: string): string {
  try {
    return formatDateLaPaz(dueAt);
  } catch {
    return '—';
  }
}

/** Título y detalle del aviso cuando falla la carga (sin conexión o error general). */
export function loadErrorOutcome(error: ApiError): { title: string; message: string } {
  if (isConnectionError(error)) {
    return { title: REPUTATION_MESSAGES.offlineTitle, message: REPUTATION_MESSAGES.offline };
  }
  return { title: REPUTATION_MESSAGES.loadFailed, message: REPUTATION_MESSAGES.unexpected };
}
