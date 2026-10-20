import type { ReviewNotice } from '@/components/features/charges/owner-review-model';
import { isConnectionError, NETWORK_ERROR_CODE, type ApiError } from '@/services/http';

export const REPUTATION_TEXT_MIN_LENGTH = 10;
export const REPUTATION_TEXT_MAX_LENGTH = 300;

/** `report`: el dueño del cobro reporta; `exclude`: el titular excluye el cobro (RF-007-14). */
export type ReputationAction = 'report' | 'exclude';

export const REPUTATION_MESSAGES = {
  reportTitle: 'Reportar calificación',
  excludeTitle: 'Excluir de la reputación',
  textLength: `Escribe entre ${REPUTATION_TEXT_MIN_LENGTH} y ${REPUTATION_TEXT_MAX_LENGTH} caracteres.`,
  offline: 'Sin conexión con el servidor. Revisa tu internet e intenta de nuevo.',
  generic: {
    report: 'No pudimos enviar el reporte. Intenta de nuevo.',
    exclude: 'No pudimos excluir el cobro. Intenta de nuevo.',
  },
  forbidden: {
    report: 'No puedes reportar la calificación de este cobro.',
    exclude: 'Solo el titular del grupo puede excluir este cobro de la reputación.',
  },
  notFound: 'Cobro no encontrado.',
  alreadyExcluded: 'Este cobro ya está excluido de la reputación',
  reportAlreadySent: 'Ya enviaste un reporte para este cobro',
  reported: 'Reporte enviado',
  reportedDetail: 'Recibimos tu reporte sobre la calificación de este cobro.',
  excluded: 'Cobro excluido de la reputación',
  excludedDetail:
    'Quedó registrado quién lo excluyó y cuándo. La calificación se actualiza en el sistema.',
} as const;

/** Ayuda en el cliente (mismo rango que el backend, que vuelve a validar y responde `400`). */
export function validateReputationText(text: string): string | null {
  const length = text.trim().length;
  if (length < REPUTATION_TEXT_MIN_LENGTH || length > REPUTATION_TEXT_MAX_LENGTH) {
    return REPUTATION_MESSAGES.textLength;
  }
  return null;
}

/**
 * `modal`: el error queda dentro del modal y se puede reintentar; `field`: va en el campo del
 * texto; `page`: se cierra el modal y el aviso queda en la página.
 */
export type ReputationError =
  | { target: 'modal'; message: string }
  | { target: 'field'; message: string }
  | { target: 'page'; notice: ReviewNotice };

/**
 * Código de negocio del error. El backend responde `BUSINESS_RULE` y pone el código concreto en
 * `details.code` (diferencia con `contracts/api.md`, spec 007); si llega directo en `code`, se usa.
 */
function businessCode(error: ApiError): string {
  const nested = error.details?.code;
  return error.code === 'BUSINESS_RULE' && typeof nested === 'string' ? nested : error.code;
}

/** Traduce el error por `code` y luego por `statusCode` (nunca por `message`). */
export function reputationError(error: ApiError, action: ReputationAction): ReputationError {
  switch (businessCode(error)) {
    case 'CHARGE_ALREADY_EXCLUDED':
      return {
        target: 'page',
        notice: { variant: 'warning', title: REPUTATION_MESSAGES.alreadyExcluded },
      };
    case 'REPORT_ALREADY_SENT':
      return {
        target: 'page',
        notice: { variant: 'warning', title: REPUTATION_MESSAGES.reportAlreadySent },
      };
    default:
      break;
  }
  if (error.statusCode === 403) {
    return {
      target: 'page',
      notice: { variant: 'error', title: REPUTATION_MESSAGES.forbidden[action] },
    };
  }
  if (error.statusCode === 404) {
    return { target: 'page', notice: { variant: 'error', title: REPUTATION_MESSAGES.notFound } };
  }
  if (error.statusCode === 400 || error.code === 'VALIDATION_ERROR') {
    return { target: 'field', message: REPUTATION_MESSAGES.textLength };
  }
  if (error.code === NETWORK_ERROR_CODE || isConnectionError(error)) {
    return { target: 'modal', message: REPUTATION_MESSAGES.offline };
  }
  return { target: 'modal', message: REPUTATION_MESSAGES.generic[action] };
}

/** Aviso de éxito; la pantalla solo muestra lo que la API confirmó (CA-007-13). */
export function reputationSuccess(action: ReputationAction): ReviewNotice {
  if (action === 'report') {
    return {
      variant: 'success',
      title: REPUTATION_MESSAGES.reported,
      detail: REPUTATION_MESSAGES.reportedDetail,
    };
  }
  return {
    variant: 'success',
    title: REPUTATION_MESSAGES.excluded,
    detail: REPUTATION_MESSAGES.excludedDetail,
  };
}
