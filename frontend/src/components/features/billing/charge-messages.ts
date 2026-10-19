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
