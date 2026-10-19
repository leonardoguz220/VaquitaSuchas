/**
 * Mensajes de Ajustes del titular (T034, T037), elegidos por `code` y `details.rule`, nunca por
 * `message` (contrato 001: `PATCH /groups/:id`, `POST …/transfer-ownership` y `POST …/close`).
 */
import { isConnectionError, type ApiError } from '@/services/http';

export const SETTINGS_MESSAGES = {
  connection: 'Sin conexión con el servidor. Revisa tu internet y vuelve a intentarlo.',
  stale: 'Otra persona modificó el grupo. Lo recargamos: revisa tus cambios y vuelve a guardar.',
  closed: 'El grupo está cerrado: ya no se puede cambiar.',
  frozen: 'El grupo está en solo lectura porque el titular fue baneado.',
  forbidden: 'Solo el titular puede cambiar los ajustes del grupo.',
  notFound: 'Este grupo ya no existe o no eres parte de él.',
  reviewForm: 'Revisa los datos marcados.',
  outOfRange: 'El precio o los cupos están fuera del rango permitido.',
  slotsOverPlan: 'Los cupos no pueden superar los que permite el plan.',
  unexpected: 'Ocurrió un error inesperado. Inténtalo de nuevo.',
  pendingPayments: 'Hay solicitudes de ingreso en pago. Resuélvelas antes de seguir.',
  transferTarget: 'Elige a otro miembro activo del grupo como nuevo titular.',
  transferNotEligible: 'La persona elegida todavía no puede ser titular.',
  transferTooMany: 'La persona elegida ya tiene el máximo de grupos activos como titular.',
} as const;

export interface SettingsErrorView {
  /** Campo que se marca en el formulario, si el error es de un dato concreto. */
  field?: 'totalSlots';
  message: string;
}

function ruleOf(error: ApiError): string {
  return typeof error.details?.rule === 'string' ? error.details.rule : '';
}

/** Mensaje de `PATCH /groups/:id` (RF-001-14, RF-001-09). El `409` lo maneja el hook. */
export function settingsErrorView(error: ApiError): SettingsErrorView {
  if (isConnectionError(error)) return { message: SETTINGS_MESSAGES.connection };
  const rule = ruleOf(error);
  if (error.statusCode === 409 || error.code === 'STALE_STATE') {
    return { message: SETTINGS_MESSAGES.stale };
  }
  // Contrato: `SLOTS_BELOW_MEMBERS` con `details.minSlots`. El backend hoy lo manda también como
  // `BUSINESS_RULE` con `details.rule = "RF-001-14"`; se acepta cualquiera de las dos formas.
  if (error.code === 'SLOTS_BELOW_MEMBERS' || rule === 'RF-001-14') {
    const minSlots = error.details?.minSlots;
    const text =
      typeof minSlots === 'number'
        ? `Los cupos no pueden bajar de ${minSlots}: ya hay ${minSlots} personas en el grupo.`
        : 'Los cupos no pueden bajar del número de personas que ya hay en el grupo.';
    return { field: 'totalSlots', message: text };
  }
  if (rule === 'RN-001-13')
    return { field: 'totalSlots', message: SETTINGS_MESSAGES.slotsOverPlan };
  if (rule === 'RN-001-09') return { message: SETTINGS_MESSAGES.outOfRange };
  if (error.code === 'GROUP_CLOSED' || rule === 'RN-001-07') {
    return { message: SETTINGS_MESSAGES.closed };
  }
  if (error.code === 'GROUP_FROZEN' || rule.startsWith('RN-009-')) {
    return { message: SETTINGS_MESSAGES.frozen };
  }
  if (error.code === 'VALIDATION_ERROR') return { message: SETTINGS_MESSAGES.reviewForm };
  if (error.statusCode === 403) return { message: SETTINGS_MESSAGES.forbidden };
  if (error.statusCode === 404) return { message: SETTINGS_MESSAGES.notFound };
  return { message: SETTINGS_MESSAGES.unexpected };
}

/** Mensaje de transferir la titularidad (RF-001-17, RF-001-21, RN-001-14, RN-010-09). */
export function transferErrorMessage(error: ApiError): string {
  if (isConnectionError(error)) return SETTINGS_MESSAGES.connection;
  const rule = ruleOf(error);
  if (error.code === 'NOT_HOST_ELIGIBLE' || rule === 'RF-001-21') {
    return SETTINGS_MESSAGES.transferNotEligible;
  }
  if (error.code === 'TOO_MANY_ACTIVE_GROUPS' || rule === 'RN-001-14') {
    return SETTINGS_MESSAGES.transferTooMany;
  }
  if (rule === 'RN-010-09') return SETTINGS_MESSAGES.pendingPayments;
  if (rule === 'RF-001-17') return SETTINGS_MESSAGES.transferTarget;
  return genericActionMessage(error);
}

/** Mensaje de cerrar el grupo (RF-001-18, RN-010-09). */
export function closeErrorMessage(error: ApiError): string {
  if (isConnectionError(error)) return SETTINGS_MESSAGES.connection;
  if (ruleOf(error) === 'RN-010-09') return SETTINGS_MESSAGES.pendingPayments;
  return genericActionMessage(error);
}

function genericActionMessage(error: ApiError): string {
  if (error.code === 'GROUP_CLOSED' || ruleOf(error) === 'RN-001-07') {
    return SETTINGS_MESSAGES.closed;
  }
  if (error.code === 'GROUP_FROZEN' || ruleOf(error).startsWith('RN-009-')) {
    return SETTINGS_MESSAGES.frozen;
  }
  if (error.statusCode === 403) return SETTINGS_MESSAGES.forbidden;
  if (error.statusCode === 404) return SETTINGS_MESSAGES.notFound;
  return SETTINGS_MESSAGES.unexpected;
}
