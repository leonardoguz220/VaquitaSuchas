/**
 * Textos de las pantallas de solicitudes de ingreso (plan 010 §6). Los errores se eligen por
 * `code` y estado HTTP, nunca por `message` (contrato 000 A.2). Ningún texto decide un estado:
 * los estados, los plazos y las cuotas salen de la API.
 */
import type { BadgeTone } from '@/components/ui';
import { formatDateLaPaz, formatDateTimeLaPaz } from '@/lib/dates';
import { isConnectionError, type ApiError } from '@/services/http';
import type { JoinRequestPerson, JoinRequestStatus } from '@/services/join-requests';
import { REGISTER_ERROR_MESSAGES } from '../auth/register-errors';
import { formatDecimal } from '../groups/group-messages';

export const JOIN_MESSAGES = {
  /** RF-010-25: lo que Vaquita no hace, antes de pagar. */
  noCustody:
    'Vaquita no recibe, no guarda ni devuelve dinero, y no puede obligar al titular a devolverlo. Si pagas y no te agregan, puedes abrir un reclamo: sirve para sancionar y dejar constancia.',
  codeLength: 'El código tiene 8 caracteres.',
  invalidCode: 'Código inválido.',
  noSlots: 'No hay cupos disponibles en este grupo.',
  notAccepting: 'El titular pausó la recepción de nuevos miembros.',
  activeExists: 'Ya tienes una solicitud activa en este grupo.',
  tooMany: 'Ya tienes 5 solicitudes activas. Espera a que alguna termine para abrir otra.',
  openCharges:
    'Tienes un cobro abierto en este grupo. Págalo o espera a que el titular lo cancele para volver a entrar.',
  alreadyMember: 'Ya eres miembro de este grupo.',
  groupFrozen: 'El grupo está en solo lectura porque su titular fue baneado.',
  accountRestricted: 'Tu cuenta está restringida y no puede abrir solicitudes.',
  windowClosed: 'La ventana de ingreso de este grupo está cerrada.',
  connection: REGISTER_ERROR_MESSAGES.connection,
  unexpected: REGISTER_ERROR_MESSAGES.unexpected,
  checkingDeadline: 'Se cumplió el plazo. Actualizando la solicitud…',
  readOnlyChat: 'Chat en solo lectura',
} as const;

/** Detalle del aviso cuando falla una carga que no es un `401`. */
export function joinErrorMessage(error: ApiError): string {
  return isConnectionError(error) ? JOIN_MESSAGES.connection : JOIN_MESSAGES.unexpected;
}

/**
 * Código de la regla incumplida. El contrato lo nombra como `code` propio (tabla «Errores
 * propios») y también como `422 BUSINESS_RULE` con `details.rule`; se aceptan las dos formas.
 * [NECESITA ACLARACIÓN] cuál envía el backend.
 */
export function joinErrorCode(error: ApiError): string {
  if (error.code === 'BUSINESS_RULE' && typeof error.details?.code === 'string') {
    return error.details.code;
  }
  return error.code;
}

/** Texto de cada estado de una solicitud (RN-010-05). */
export const JOIN_STATUS_LABEL: Record<JoinRequestStatus, string> = {
  abierta: 'Abierta',
  esperando_pago: 'Esperando pago',
  pago_informado: 'Pago informado',
  aceptada: 'Aceptada',
  rechazada: 'Rechazada',
  cancelada: 'Cancelada',
  expirada: 'Expirada',
};

/** Color de cada estado (mockups, README): siempre acompañado del texto y un ícono. */
export const JOIN_STATUS_TONE: Record<JoinRequestStatus, BadgeTone> = {
  abierta: 'info',
  esperando_pago: 'warning',
  pago_informado: 'info',
  aceptada: 'success',
  rechazada: 'danger',
  cancelada: 'neutral',
  expirada: 'neutral',
};

/** Por qué terminó una solicitud (`finalReason`, data-model 010). */
export const FINAL_REASON_LABEL: Record<string, string> = {
  confirmada: 'El titular confirmó tu pago.',
  efectivo: 'El titular registró un pago en efectivo.',
  rechazo_titular: 'El titular rechazó la solicitud.',
  cancelada_solicitante: 'Cancelaste la solicitud.',
  plazo_solicitud: 'El titular no envió los datos de pago a tiempo.',
  ventana_cerrada: 'Se cerró la ventana de ingreso del grupo.',
  plazo_pago: 'No se subió el comprobante dentro del plazo.',
  titular_sin_respuesta: 'El titular no respondió a tiempo.',
  grupo_cerrado: 'El grupo se cerró.',
  titular_baneado: 'La cuenta del titular fue baneada.',
  sin_cupo: 'El grupo se quedó sin cupos.',
  solicitante_suspendido: 'La cuenta del solicitante fue restringida.',
  aceptado_en_otro_grupo: 'Entraste a otro grupo del mismo servicio.',
};

/** Texto del motivo final, o `null` si la API no manda uno conocido. */
export function finalReasonText(reason: string | null): string | null {
  return reason ? (FINAL_REASON_LABEL[reason] ?? null) : null;
}

/** «★ 4,5 · Muy bueno» o «Sin calificación» (spec 007; `stars: null`). */
export function ratingText(person: Pick<JoinRequestPerson, 'stars' | 'level'>): string {
  if (person.stars === null) return 'Sin calificación';
  return person.level
    ? `★ ${formatDecimal(person.stars)} · ${person.level}`
    : `★ ${formatDecimal(person.stars)}`;
}

/** Fecha de apertura de la ventana (`details.opensAt` o `entryWindow.opensAt`). */
export function opensAtText(opensAt: string): string {
  return `El ingreso a este grupo se abre el ${formatDateLaPaz(opensAt)}.`;
}

/** Hasta cuándo está abierta la ventana de ingreso. */
export function closesAtText(closesAt: string): string {
  return `Ventana de ingreso abierta hasta el ${formatDateTimeLaPaz(closesAt)}.`;
}

function opensAtFrom(error: ApiError): string | null {
  const value = error.details?.opensAt;
  if (typeof value !== 'string') return null;
  try {
    return opensAtText(value);
  } catch {
    return null;
  }
}

function retryAfterText(error: ApiError): string {
  const seconds = error.details?.retryAfterSeconds;
  if (typeof seconds === 'number' && seconds > 0) {
    const minutes = Math.ceil(seconds / 60);
    return `Hiciste demasiados intentos. Prueba de nuevo en ${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}.`;
  }
  return 'Hiciste demasiados intentos. Prueba de nuevo en unos minutos.';
}

/** Qué mostrar si falla `POST /join-requests` (plan 010 §6 y spec §9). */
export interface OpenErrorOutcome {
  /** Junto al campo del código, o `null` para el aviso general. */
  field: 'code' | null;
  message: string;
}

export function openErrorOutcome(error: ApiError): OpenErrorOutcome {
  const general = (message: string): OpenErrorOutcome => ({ field: null, message });
  switch (joinErrorCode(error)) {
    case 'INVALID_INVITE_CODE':
      return { field: 'code', message: JOIN_MESSAGES.invalidCode };
    case 'VALIDATION_ERROR':
      return { field: 'code', message: JOIN_MESSAGES.codeLength };
    case 'RATE_LIMITED':
      return general(retryAfterText(error));
    case 'ENTRY_WINDOW_CLOSED':
      return general(opensAtFrom(error) ?? JOIN_MESSAGES.windowClosed);
    case 'GROUP_NOT_ACCEPTING':
      return general(JOIN_MESSAGES.notAccepting);
    case 'NO_SLOTS_AVAILABLE':
      return general(JOIN_MESSAGES.noSlots);
    case 'ACTIVE_REQUEST_EXISTS':
      return general(JOIN_MESSAGES.activeExists);
    case 'TOO_MANY_ACTIVE_REQUESTS':
      return general(JOIN_MESSAGES.tooMany);
    case 'OPEN_CHARGES_IN_GROUP':
      return general(JOIN_MESSAGES.openCharges);
    case 'ALREADY_MEMBER':
      return general(JOIN_MESSAGES.alreadyMember);
    case 'GROUP_FROZEN':
      return general(JOIN_MESSAGES.groupFrozen);
    case 'ACCOUNT_RESTRICTED':
      return general(JOIN_MESSAGES.accountRestricted);
  }
  return general(joinErrorMessage(error));
}

/** Normaliza lo que escribe la persona: mayúsculas, sin espacios, hasta 8 caracteres. */
export function normalizeInviteCode(value: string): string {
  return value.replace(/\s+/g, '').toUpperCase().slice(0, 8);
}

/** Pasos de «Cómo funciona» (mockup `Unirse.dc.html`). */
export const HOW_IT_WORKS = [
  'Abres la solicitud y conversas con el titular en un chat privado.',
  'El titular te envía sus datos de pago y se reserva tu cupo.',
  'Tienes 15 minutos para pagar y subir el comprobante con su referencia.',
  'El titular confirma en hasta 60 minutos y ya eres miembro.',
] as const;
