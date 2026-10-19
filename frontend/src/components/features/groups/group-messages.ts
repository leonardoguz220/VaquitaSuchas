/**
 * Textos de las pantallas de grupos (plan 001 §6). Los errores se eligen por `code` y estado
 * HTTP, nunca por `message` (contrato 000 A.2). Los mensajes por `code` de `POST /groups`
 * (`NOT_HOST_ELIGIBLE`, `TOO_MANY_ACTIVE_GROUPS`...) llegan al conectar el asistente (T017).
 */
import { isConnectionError, type ApiError } from '@/services/http';
import { REGISTER_ERROR_MESSAGES } from '../auth/register-errors';

export const GROUP_MESSAGES = {
  eligibilityFailed: 'No pudimos comprobar si puedes crear suscripciones.',
  createFailed: 'No pudimos crear la suscripción.',
  reviewForm: 'Revisa los datos marcados.',
  quoteFailed: 'No pudimos calcular la cuota.',
  qrUploadFailed:
    'Creamos la suscripción, pero no pudimos subir el QR. Puedes subirlo después desde los ajustes del grupo.',
  qrType: 'El QR debe ser una imagen JPG o PNG.',
  qrSize: 'El QR pesa más de 2 MB. Elige una imagen más liviana.',
  copied: 'Copiamos el código.',
  inviteCopied: 'Copiamos la invitación con el enlace para que la pegues donde quieras.',
  copyFailed: 'No pudimos copiar. Selecciona el código y cópialo a mano.',
  regenerateFailed: 'No pudimos regenerar el código.',
  regenerated: 'Generamos un código nuevo. El anterior ya no sirve.',
  acceptingFailed: 'No pudimos cambiar la recepción de nuevos miembros.',
  acceptingOn: 'El grupo vuelve a recibir solicitudes con el código.',
  acceptingOff: 'Pausaste la recepción de nuevos miembros.',
  /** `409 STALE_STATE` (plan 001 §6): se recarga el grupo. */
  stale: 'Otra persona modificó el grupo. Cargamos los datos actualizados.',
  groupClosed: 'El grupo está cerrado: ya no se puede modificar.',
  groupFrozen: 'El grupo está en solo lectura porque su titular fue baneado.',
  connection: REGISTER_ERROR_MESSAGES.connection,
  unexpected: REGISTER_ERROR_MESSAGES.unexpected,
} as const;

/** Detalle del aviso cuando falla una carga o un envío que no es un `401`. */
export function groupErrorMessage(error: ApiError): string {
  return isConnectionError(error) ? GROUP_MESSAGES.connection : GROUP_MESSAGES.unexpected;
}

/** `4.5` → `4,5`: número con coma decimal para la interfaz. */
export function formatDecimal(value: number): string {
  return String(value).replace('.', ',');
}

/** Mensaje de error de una acción del titular sobre el grupo (PATCH, regenerar el código). */
export function ownerActionErrorMessage(error: ApiError): string {
  if (error.code === 'STALE_STATE') return GROUP_MESSAGES.stale;
  if (error.code === 'GROUP_CLOSED') return GROUP_MESSAGES.groupClosed;
  if (error.code === 'GROUP_FROZEN') return GROUP_MESSAGES.groupFrozen;
  return groupErrorMessage(error);
}
