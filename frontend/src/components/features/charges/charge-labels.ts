import { formatDateLaPaz } from '@/lib/dates';
import type { Charge, ChargeEventType, ChargeStatus, MyCharge } from '@/services/charges';

export const CHARGES_PATH = '/cobros';

export const chargePath = (chargeId: string) => `${CHARGES_PATH}/${chargeId}`;

/** Aviso para quien dejó el grupo con una deuda (CA-002-32; mockup `MisCobros.dc.html`). */
export const FORMER_MEMBER_NOTICE =
  'Ya no perteneces a este grupo; paga tu deuda para limpiar tu historial.';

/** Opciones del filtro por estado, en el orden del mockup. */
export const STATUS_FILTERS: { value: ChargeStatus; label: string }[] = [
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'en_revision', label: 'En revisión' },
  { value: 'pagado', label: 'Pagado' },
  { value: 'atrasado', label: 'Atrasado' },
  { value: 'cancelado', label: 'Cancelado' },
];

export const EVENT_LABEL: Record<ChargeEventType, string> = {
  generado: 'Cobro emitido',
  ingreso_registrado: 'Pago de ingreso registrado',
  comprobante_subido: 'Comprobante enviado',
  comprobante_reemplazado: 'Comprobante reemplazado',
  rechazado: 'Pago rechazado',
  confirmado: 'Pago confirmado',
  pago_manual: 'Pago registrado a mano',
  atrasado: 'Marcado como atrasado',
  cancelado: 'Cobro cancelado',
  retiro_por_mora: 'Retiro del grupo por falta de pago',
};

/** Texto del evento; un tipo nuevo del backend se muestra genérico en vez de romper la vista. */
export function eventLabel(type: string): string {
  return EVENT_LABEL[type as ChargeEventType] ?? 'Movimiento del cobro';
}

/**
 * Línea de vencimiento de la tarjeta según el estado que entrega la API (no lo deduce de las
 * fechas): «Vence el…», «Venció el…», «Pagado el…».
 */
export function dueLine(charge: Pick<Charge, 'status' | 'origin' | 'dueAt' | 'paidAt'>): string {
  switch (charge.status) {
    case 'pagado':
      if (charge.origin === 'ingreso') return 'Pago de ingreso';
      return charge.paidAt ? `Pagado el ${formatDateLaPaz(charge.paidAt)}` : 'Pagado';
    case 'atrasado':
      return `Venció el ${formatDateLaPaz(charge.dueAt)}`;
    case 'cancelado':
      return `Cancelado · vencía el ${formatDateLaPaz(charge.dueAt)}`;
    default:
      return `Vence el ${formatDateLaPaz(charge.dueAt)}`;
  }
}

export function showsFormerMemberNotice(charge: Pick<MyCharge, 'member'>): boolean {
  return charge.member.isFormerMember;
}
