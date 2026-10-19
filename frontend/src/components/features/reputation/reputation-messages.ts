/**
 * Textos de la reputación (plan 007 §6). Los errores se eligen por estado HTTP y `code`, nunca
 * por `message` (contrato 000 A.2). Nada aquí calcula calificaciones, niveles ni rachas.
 */
import { isConnectionError, type ApiError } from '@/services/http';
import type { ChargeRatingResult } from '@/services/reputation';
import { REGISTER_ERROR_MESSAGES } from '../auth/register-errors';

export const REPUTATION_MESSAGES = {
  connection: REGISTER_ERROR_MESSAGES.connection,
  unexpected: REGISTER_ERROR_MESSAGES.unexpected,
  loadFailed: 'No pudimos cargar tu reputación.',
  badgesLoadFailed: 'No pudimos cargar tus insignias.',
} as const;

/** Detalle del aviso cuando falla una carga de la reputación que no es un `401`. */
export function reputationErrorMessage(error: ApiError): string {
  return isConnectionError(error) ? REPUTATION_MESSAGES.connection : REPUTATION_MESSAGES.unexpected;
}

export const RESULT_LABEL: Record<ChargeRatingResult, string> = {
  puntual: 'Puntual',
  tardio: 'Tarde',
};

/** `"4.3750"` → `"4,375"`: solo da formato al valor exacto que entrega la API. */
export function formatExactStars(exact: string): string {
  const [whole, decimals = ''] = exact.split('.');
  const trimmed = decimals.replace(/0+$/, '');
  return trimmed ? `${whole},${trimmed}` : whole;
}

/** `4.5` → `"4,5"`. */
export function formatStarsNumber(value: number): string {
  return String(value).replace('.', ',');
}

/** `1 cobro` / `3 cobros`. */
export function chargesText(count: number): string {
  return `${count} ${count === 1 ? 'cobro' : 'cobros'}`;
}
