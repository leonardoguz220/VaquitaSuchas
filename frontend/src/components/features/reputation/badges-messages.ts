/**
 * Textos y utilidades de «Mis insignias» (spec 007, RF-007-07). Las insignias y su avance vienen
 * de la API; aquí solo se dan formato y se arma la barra de presentación.
 */
import { formatDateLaPaz } from '@/lib/dates';
import { isConnectionError, type ApiError } from '@/services/http';

export const BADGES_MESSAGES = {
  title: 'Mis insignias',
  intro: 'Las insignias se obtienen al pagar a tiempo. Las que aún no tienes muestran tu avance.',
  backToReputation: 'Volver a mi reputación',
  loading: 'Cargando tus insignias…',
  loadFailed: 'No pudimos cargar tus insignias.',
  offlineTitle: 'Sin conexión.',
  offline: 'Revisa tu internet y vuelve a intentarlo.',
  unexpected: 'Ocurrió un error inesperado. Inténtalo de nuevo.',
  retry: 'Reintentar',
  earnedTitle: 'Obtenidas',
  earnedEmpty: 'Aún no tienes insignias',
  earnedLabel: 'Obtenida el',
  pendingTitle: 'Por obtener',
  pendingStatus: 'Pendiente',
} as const;

/**
 * Porcentaje de la barra de avance: `current / target` acotado a 0–100. Solo sirve para dibujar el
 * ancho; el texto «2 de 10» usa los valores que entrega la API. Con `target` no positivo da 0.
 */
export function progressPercent(current: number, target: number): number {
  if (!Number.isFinite(current) || !Number.isFinite(target) || target <= 0) return 0;
  return Math.min(100, Math.max(0, (current / target) * 100));
}

/** Texto del avance: `2 de 10`. */
export function progressText(current: number, target: number): string {
  return `${current} de ${target}`;
}

/** Fecha en que se obtuvo, en La Paz (`18 ago 2026`), o un guion si no es una fecha válida. */
export function earnedDateText(earnedAt: string): string {
  try {
    return formatDateLaPaz(earnedAt);
  } catch {
    return '—';
  }
}

/** Título y detalle del aviso cuando falla la carga (sin conexión o error general). */
export function badgesErrorOutcome(error: ApiError): { title: string; message: string } {
  if (isConnectionError(error)) {
    return { title: BADGES_MESSAGES.offlineTitle, message: BADGES_MESSAGES.offline };
  }
  return { title: BADGES_MESSAGES.loadFailed, message: BADGES_MESSAGES.unexpected };
}
