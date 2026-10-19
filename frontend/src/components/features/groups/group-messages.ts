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
