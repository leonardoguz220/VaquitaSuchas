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
  rankingLoadFailed: 'No pudimos cargar el ranking.',
  rankingNotFound: 'No encontramos el ranking de este grupo.',
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

export type ReputationCorrectionKind = 'report' | 'exclusion';

export interface CorrectionErrorOutcome {
  message: string;
  /** El error es del campo de texto (validación `400`). */
  field: boolean;
  /** Ya no tiene sentido volver a intentarlo: se oculta el botón. */
  finished: boolean;
}

/**
 * Error del reporte o de la exclusión de un cobro (RF-007-14), por `code` y estado HTTP
 * (contrato 007): `422 CHARGE_ALREADY_EXCLUDED` y `REPORT_ALREADY_SENT`, `400`, `403` y `404`.
 */
export function correctionErrorOutcome(
  kind: ReputationCorrectionKind,
  error: ApiError,
): CorrectionErrorOutcome {
  if (error.code === 'CHARGE_ALREADY_EXCLUDED') {
    return {
      message: 'Este cobro ya está excluido de la reputación.',
      field: false,
      finished: true,
    };
  }
  if (error.code === 'REPORT_ALREADY_SENT') {
    return {
      message: 'Ya reportaste este cobro. El titular lo revisará.',
      field: false,
      finished: true,
    };
  }
  if (error.statusCode === 400) {
    return { message: 'Escribe entre 10 y 300 caracteres.', field: true, finished: false };
  }
  if (error.statusCode === 403) {
    return {
      message:
        kind === 'report'
          ? 'Solo la persona a nombre de quien está el cobro puede reportarlo.'
          : 'Solo el titular del grupo puede excluir un cobro de la reputación.',
      field: false,
      finished: true,
    };
  }
  if (error.statusCode === 404) {
    return { message: 'No encontramos este cobro.', field: false, finished: true };
  }
  if (error.statusCode === 422) {
    return {
      message: 'Este cobro no se puede corregir en la reputación.',
      field: false,
      finished: true,
    };
  }
  return { message: reputationErrorMessage(error), field: false, finished: false };
}
