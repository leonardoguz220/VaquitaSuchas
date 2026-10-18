/**
 * Mensajes de `/registro/verificar` (RF-003-21). Se eligen siempre por `code` y nunca por
 * `message` (contrato 000 A.2; tabla de errores del contrato 003).
 */
import { isConnectionError, type ApiError } from '@/services/http';

export const REGISTER_VERIFY_MESSAGES = {
  notAllowed: 'No es posible crear la cuenta con estos datos.',
  phoneNotBolivian:
    'El número que compartiste no es un celular boliviano. Usa una cuenta de Telegram con un número de Bolivia (+591).',
  phoneTaken: 'Ya existe una cuenta con ese celular.',
  telegramTaken: 'Ya existe una cuenta con esa cuenta de Telegram.',
  expired: 'El enlace venció.',
  expiredHint: 'Pide uno nuevo para seguir con la verificación.',
  needsLink: 'Pide un enlace nuevo para continuar.',
  verified: '¡Listo! Tu celular quedó verificado.',
  inactive: 'Tu registro ya no está activo. Vuelve a crear tu cuenta.',
  rateLimited: 'Pediste demasiados enlaces. Espera unos minutos.',
  connection: 'No se pudo contactar con el servidor. Inténtalo de nuevo.',
  unexpected: 'Ocurrió un error inesperado. Inténtalo de nuevo.',
  pollingConnection: 'Sin conexión, reintentando…',
  pollingServer: 'No pudimos consultar el estado, reintentando…',
} as const;

const REJECTED_MESSAGES: Record<string, string> = {
  // Genérico a propósito: el bloqueo no dice qué dato está bloqueado (RF-003-19).
  REGISTRATION_NOT_ALLOWED: REGISTER_VERIFY_MESSAGES.notAllowed,
  PHONE_NOT_BOLIVIAN: REGISTER_VERIFY_MESSAGES.phoneNotBolivian,
  PHONE_ALREADY_REGISTERED: REGISTER_VERIFY_MESSAGES.phoneTaken,
  TELEGRAM_ALREADY_REGISTERED: REGISTER_VERIFY_MESSAGES.telegramTaken,
};

/** Mensaje de un `rejected` de `GET /auth/register/status`; un código desconocido es genérico. */
export function rejectedMessage(code: string): string {
  return Object.hasOwn(REJECTED_MESSAGES, code)
    ? REJECTED_MESSAGES[code]
    : REGISTER_VERIFY_MESSAGES.notAllowed;
}

function rateLimitedMessage(details: ApiError['details']): string {
  const seconds = details?.retryAfterSeconds;
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) {
    return REGISTER_VERIFY_MESSAGES.rateLimited;
  }
  const minutes = Math.ceil(seconds / 60);
  const unit = minutes === 1 ? 'minuto' : 'minutos';
  return `Pediste demasiados enlaces. Espera ${minutes} ${unit}.`;
}

/**
 * Mensaje de un error de `POST /auth/register/link` que se muestra en pantalla. `401` y
 * `409 ALREADY_VERIFIED` no llegan aquí: la pantalla los resuelve con otra acción.
 */
export function registerLinkErrorMessage(error: ApiError): string {
  if (isConnectionError(error)) return REGISTER_VERIFY_MESSAGES.connection;
  if (error.code === 'RATE_LIMITED') return rateLimitedMessage(error.details);
  return REGISTER_VERIFY_MESSAGES.unexpected;
}
