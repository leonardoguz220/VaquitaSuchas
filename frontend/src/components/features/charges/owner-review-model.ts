import { chargeStatusLabel } from '@/components/ui';
import { isConnectionError, NETWORK_ERROR_CODE, type ApiError } from '@/services/http';
import type { Charge } from '@/services/charges';

export const REASON_MIN_LENGTH = 5;
export const REASON_MAX_LENGTH = 200;
export const MANUAL_NOTE_MAX_LENGTH = 200;
/** La Paz no tiene horario de verano: UTC-4 todo el año. */
const LA_PAZ_OFFSET = '-04:00';

export type ReviewAction = 'confirm' | 'reject' | 'manualPayment' | 'cancel';

export const REVIEW_MESSAGES = {
  forbidden: {
    confirm: 'Solo el titular puede confirmar este cobro',
    reject: 'Solo el titular puede rechazar este cobro',
    manualPayment: 'Solo el titular puede registrar el pago de este cobro',
    cancel: 'Solo el titular puede cancelar este cobro',
  },
  invalidTransition: 'Este cobro ya no admite cambios.',
  stale: 'Otra persona modificó el cobro; recargamos los datos',
  frozen: 'El grupo está congelado por ahora y no admite cambios en sus cobros.',
  reasonMissing: 'Escribe el motivo del rechazo.',
  reasonLength: `El motivo debe tener entre ${REASON_MIN_LENGTH} y ${REASON_MAX_LENGTH} caracteres.`,
  offline: 'Sin conexión con el servidor. Revisa tu internet e intenta de nuevo.',
  generic: {
    confirm: 'No pudimos confirmar el pago. Intenta de nuevo.',
    reject: 'No pudimos rechazar el comprobante. Intenta de nuevo.',
    manualPayment: 'No pudimos registrar el pago en efectivo. Intenta de nuevo.',
    cancel: 'No pudimos cancelar el cobro. Intenta de nuevo.',
  },
  confirmed: 'Pago confirmado',
  rejected: 'Comprobante rechazado',
  paid: 'Pago en efectivo registrado',
  cancelled: 'Cobro cancelado',
  paidAtBeforeIssue: 'La fecha del pago no puede ser anterior a la emisión del cobro.',
  paidAtFuture: 'La fecha del pago no puede estar en el futuro.',
  paidAtInvalid: 'Revisa la fecha y la nota del pago.',
  noteLength: `La nota no puede pasar de ${MANUAL_NOTE_MAX_LENGTH} caracteres.`,
  fileDeleted: 'El comprobante ya fue eliminado por antigüedad',
  fileForbidden: 'No tienes acceso a este comprobante',
  fileNotFound: 'No encontramos este comprobante',
  fileGeneric: 'No pudimos abrir el comprobante. Intenta de nuevo.',
} as const;

/** Ayuda en el cliente (CA-002-08); el backend vuelve a validar y responde `400`. */
export function validateReason(reason: string): string | null {
  const length = reason.trim().length;
  if (length === 0) return REVIEW_MESSAGES.reasonMissing;
  if (length < REASON_MIN_LENGTH || length > REASON_MAX_LENGTH) return REVIEW_MESSAGES.reasonLength;
  return null;
}

export interface ReviewNotice {
  variant: 'success' | 'warning' | 'error';
  title: string;
  detail?: string;
}

/**
 * `modal`: el error se muestra dentro del modal y se puede reintentar; `reason`: va en el campo
 * del motivo; `page`: se cierra el modal y el aviso queda en la página.
 */
export type ReviewError =
  | { target: 'modal'; message: string }
  | { target: 'reason'; message: string }
  | { target: 'page'; notice: ReviewNotice };

/** Traduce el error por `code` y `statusCode` (contrato A.2), nunca por `message`. */
export function reviewError(error: ApiError, action: ReviewAction): ReviewError {
  if (error.statusCode === 403) {
    return {
      target: 'page',
      notice: { variant: 'error', title: REVIEW_MESSAGES.forbidden[action] },
    };
  }
  switch (error.code) {
    case 'STALE_STATE':
      return { target: 'page', notice: { variant: 'warning', title: REVIEW_MESSAGES.stale } };
    case 'INVALID_TRANSITION':
      return {
        target: 'page',
        notice: { variant: 'error', title: REVIEW_MESSAGES.invalidTransition },
      };
    case 'GROUP_FROZEN':
      return { target: 'page', notice: { variant: 'error', title: REVIEW_MESSAGES.frozen } };
    case 'VALIDATION_ERROR':
      if (action === 'reject' || action === 'cancel') {
        return { target: 'reason', message: REVIEW_MESSAGES.reasonLength };
      }
      if (action === 'manualPayment') {
        return { target: 'modal', message: REVIEW_MESSAGES.paidAtInvalid };
      }
      return { target: 'modal', message: REVIEW_MESSAGES.generic.confirm };
    default:
      if (error.code === NETWORK_ERROR_CODE || isConnectionError(error)) {
        return { target: 'modal', message: REVIEW_MESSAGES.offline };
      }
      return { target: 'modal', message: REVIEW_MESSAGES.generic[action] };
  }
}

/** Aviso tras el éxito con el estado que devolvió la API (CA-002-06, CA-002-07, CA-002-30). */
export function reviewSuccess(charge: Charge, action: ReviewAction): ReviewNotice {
  const name = charge.member.fullName;
  const status = `«${chargeStatusLabel[charge.status]}»`;
  switch (action) {
    case 'confirm':
      return {
        variant: 'success',
        title: REVIEW_MESSAGES.confirmed,
        detail: `El cobro de ${name} quedó ${status}.`,
      };
    case 'manualPayment':
      return {
        variant: 'success',
        title: REVIEW_MESSAGES.paid,
        detail: `El cobro de ${name} quedó ${status}.`,
      };
    case 'cancel':
      return {
        variant: 'success',
        title: REVIEW_MESSAGES.cancelled,
        detail: `El cobro de ${name} quedó ${status} y ya no cuenta como deuda.`,
      };
    case 'reject':
      return {
        variant: 'success',
        title: REVIEW_MESSAGES.rejected,
        detail: `El cobro de ${name} quedó ${status}. ${name} verá el motivo.`,
      };
  }
}

/**
 * Convierte la fecha y hora de un `datetime-local` (`2026-10-19T14:30`, hora de La Paz) en ISO
 * 8601 con el desfase de La Paz, que es el formato que pide la API.
 */
export function laPazInputToIso(value: string): string {
  return `${value}:00${LA_PAZ_OFFSET}`;
}

/**
 * Ayuda en el cliente para la fecha del pago (CA-002-14): no puede ser anterior a la emisión ni
 * estar en el futuro. Sin fecha, el servidor usa la hora actual. Devuelve `null` si es válida.
 */
export function validatePaidAt(paidAtIso: string, issuedAt: string, now: Date): string | null {
  const paid = Date.parse(paidAtIso);
  if (Number.isNaN(paid)) return REVIEW_MESSAGES.paidAtInvalid;
  if (paid < Date.parse(issuedAt)) return REVIEW_MESSAGES.paidAtBeforeIssue;
  if (paid > now.getTime() + 60_000) return REVIEW_MESSAGES.paidAtFuture;
  return null;
}

/** Ayuda en el cliente para la nota del pago en efectivo (CA-002-14, ≤200 caracteres). */
export function validateManualNote(note: string): string | null {
  return note.trim().length > MANUAL_NOTE_MAX_LENGTH ? REVIEW_MESSAGES.noteLength : null;
}

/** Error al pedir la URL firmada del comprobante. */
export function receiptFileError(error: ApiError): string {
  if (error.statusCode === 410 || error.code === 'FILE_DELETED') return REVIEW_MESSAGES.fileDeleted;
  if (error.statusCode === 403) return REVIEW_MESSAGES.fileForbidden;
  if (error.statusCode === 404) return REVIEW_MESSAGES.fileNotFound;
  if (error.code === NETWORK_ERROR_CODE || isConnectionError(error)) return REVIEW_MESSAGES.offline;
  return REVIEW_MESSAGES.fileGeneric;
}
