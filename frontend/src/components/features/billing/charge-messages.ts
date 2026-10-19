/**
 * Textos de las pantallas de cobros (plan 002 §6). Los errores se eligen por `code` y estado
 * HTTP, nunca por `message` (contrato 000 A.2). Ningún texto decide un estado: los estados y
 * las fechas salen de la API.
 */
import { formatDateLaPaz, formatDeadlineLaPaz } from '@/lib/dates';
import type { ChargeEventType, ChargePublic, PaymentMethod } from '@/services/charges';
import { isConnectionError, type ApiError } from '@/services/http';
import { REGISTER_ERROR_MESSAGES } from '../auth/register-errors';

export const CHARGE_MESSAGES = {
  /** Aviso de los cobros `atrasado` de un grupo que la persona ya dejó (RN-002-11). */
  formerMemberDebt: 'Ya no perteneces a este grupo. Paga tu deuda para limpiar tu historial.',
  /** RF-002-09: el titular no configuró sus datos de pago. */
  paymentInfoMissing:
    'El titular aún no configuró sus datos de pago. Escríbele para que te diga cómo pagarle.',
  paymentOutside:
    'Paga fuera de Vaquita, por transferencia o QR. Vaquita no recibe ni guarda dinero.',
  copied: 'Copiamos los datos de pago.',
  copyFailed: 'No pudimos copiar. Selecciona el texto y cópialo a mano.',
  overdueWarning: 'Si no pagas antes del vencimiento, se te retira del grupo.',
  checkingDue: 'Llegó la hora del vencimiento. Actualizando el cobro…',
  receiptType: 'El comprobante debe ser una imagen JPG o PNG, o un PDF.',
  receiptSize: 'El archivo pesa más de 5 MB. Elige uno más liviano.',
  referenceRequired: 'Escribe la referencia que aparece en tu comprobante.',
  /** `409 REFERENCE_ALREADY_USED` (plan 002 §6). */
  referenceUsed: 'Esa referencia ya fue usada en este grupo',
  /** `503` al subir (plan 002 §6): el cobro no cambió. */
  storageFailed: 'No pudimos guardar el archivo, intenta de nuevo',
  /** `409 STALE_STATE` (plan 002 §6): se recarga el cobro. */
  stale: 'El cobro cambió mientras lo veías. Cargamos los datos actualizados.',
  /** `409 INVALID_TRANSITION` (spec 002 §9). */
  noLongerEditable: 'Este cobro ya no admite cambios.',
  groupFrozen: 'El grupo está en solo lectura porque su titular fue baneado.',
  reviewForm: 'Revisa el método y la referencia.',
  uploaded: 'Enviamos tu comprobante. El titular lo revisará.',
  reasonLength: 'El motivo debe tener entre 5 y 200 caracteres.',
  confirmed: 'Confirmaste el pago. El cobro quedó pagado.',
  rejected: 'Rechazaste el comprobante. El miembro verá el motivo.',
  /** `409 INVALID_TRANSITION` en una acción del titular. */
  notInReview: 'El cobro ya no está en revisión. Cargamos los datos actualizados.',
  ownerOnly: 'Solo el titular del grupo puede hacer esto.',
  fileDeleted: 'El archivo ya no está disponible: se eliminó 2 meses después del cierre del grupo.',
  fileFailed: 'No pudimos abrir el comprobante.',
  checkBank: 'Revisa en tu banco que llegó el monto con esa referencia antes de confirmar.',
  connection: REGISTER_ERROR_MESSAGES.connection,
  unexpected: REGISTER_ERROR_MESSAGES.unexpected,
} as const;

/** Detalle del aviso cuando falla una carga que no es un `401`. */
export function chargeErrorMessage(error: ApiError): string {
  return isConnectionError(error) ? CHARGE_MESSAGES.connection : CHARGE_MESSAGES.unexpected;
}

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  qr: 'QR',
  transferencia: 'Transferencia',
};

/** Texto de cada evento de la línea de tiempo (RF-002-17). */
export const CHARGE_EVENT_LABEL: Record<ChargeEventType, string> = {
  generado: 'Cobro generado',
  ingreso_registrado: 'Pago de ingreso registrado',
  comprobante_subido: 'Comprobante subido',
  comprobante_reemplazado: 'Comprobante reemplazado',
  rechazado: 'Comprobante rechazado',
  confirmado: 'Pago confirmado',
  pago_manual: 'Pago en efectivo registrado',
  atrasado: 'Cobro atrasado',
  cancelado: 'Cobro cancelado',
  retiro_por_mora: 'Retiro del grupo por falta de pago',
};

/**
 * Línea de vencimiento o de pago de una tarjeta, según el `status` y las fechas de la API:
 * `Vence el 21 oct 2026, 23:59`, `Venció el …`, `Pagado el 13 oct 2026`, `Pago de ingreso` o
 * `Cancelado`. No compara fechas: el estado lo decide el backend.
 */
export function chargeDueText(
  charge: Pick<ChargePublic, 'status' | 'dueAt' | 'paidAt' | 'origin'>,
) {
  switch (charge.status) {
    case 'pendiente':
    case 'en_revision':
      return `Vence el ${formatDeadlineLaPaz(charge.dueAt)}`;
    case 'atrasado':
      return `Venció el ${formatDeadlineLaPaz(charge.dueAt)}`;
    case 'pagado':
      if (charge.origin === 'ingreso') return 'Pago de ingreso';
      return charge.paidAt ? `Pagado el ${formatDateLaPaz(charge.paidAt)}` : 'Pagado';
    case 'cancelado':
      return 'Cancelado';
  }
}

/** Qué hacer con un error al subir el comprobante (plan 002 §6). */
export interface UploadErrorOutcome {
  /** Campo junto al que se muestra, o `null` para el aviso general. */
  field: 'file' | 'reference' | null;
  message: string;
  /** `true` si hay que volver a pedir el cobro (cambió en el servidor). */
  refresh: boolean;
}

/** Elige el mensaje por `code` y estado HTTP, nunca por `message` (contrato 000 A.2). */
export function uploadErrorOutcome(error: ApiError): UploadErrorOutcome {
  const outcome = (field: UploadErrorOutcome['field'], message: string, refresh = false) => ({
    field,
    message,
    refresh,
  });
  switch (error.code) {
    case 'REFERENCE_ALREADY_USED':
      return outcome('reference', CHARGE_MESSAGES.referenceUsed);
    case 'FILE_TOO_LARGE':
      return outcome('file', CHARGE_MESSAGES.receiptSize);
    case 'UNSUPPORTED_FILE_TYPE':
      return outcome('file', CHARGE_MESSAGES.receiptType);
    case 'STALE_STATE':
      return outcome(null, CHARGE_MESSAGES.stale, true);
    case 'INVALID_TRANSITION':
      return outcome(null, CHARGE_MESSAGES.noLongerEditable, true);
    case 'GROUP_FROZEN':
      return outcome(null, CHARGE_MESSAGES.groupFrozen);
    case 'VALIDATION_ERROR':
      return outcome(null, CHARGE_MESSAGES.reviewForm);
  }
  if (error.statusCode === 503) return outcome(null, CHARGE_MESSAGES.storageFailed);
  return outcome(null, chargeErrorMessage(error));
}

/** Qué hacer con un error al confirmar o rechazar (plan 002 §6). */
export function reviewErrorOutcome(error: ApiError): Omit<UploadErrorOutcome, 'field'> & {
  field: 'reason' | null;
} {
  switch (error.code) {
    case 'STALE_STATE':
      return { field: null, message: CHARGE_MESSAGES.stale, refresh: true };
    case 'INVALID_TRANSITION':
      return { field: null, message: CHARGE_MESSAGES.notInReview, refresh: true };
    case 'VALIDATION_ERROR':
      return { field: 'reason', message: CHARGE_MESSAGES.reasonLength, refresh: false };
    case 'GROUP_FROZEN':
      return { field: null, message: CHARGE_MESSAGES.groupFrozen, refresh: false };
  }
  if (error.statusCode === 403) {
    return { field: null, message: CHARGE_MESSAGES.ownerOnly, refresh: false };
  }
  return { field: null, message: chargeErrorMessage(error), refresh: false };
}

/** Mensaje al fallar «Ver comprobante» (`410 FILE_DELETED` por la retención, RN-002-06). */
export function receiptFileErrorMessage(error: ApiError): string {
  if (error.code === 'FILE_DELETED' || error.statusCode === 410) return CHARGE_MESSAGES.fileDeleted;
  if (isConnectionError(error)) return CHARGE_MESSAGES.connection;
  return CHARGE_MESSAGES.fileFailed;
}
