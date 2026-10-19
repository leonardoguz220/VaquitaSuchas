import { InvalidMailMessageError, type MailMessage } from '../../ports/mail.service.js';

// Reglas puras sobre el mensaje y sobre los remitentes (RF-000-12). Sin red ni framework.

const MAX_ADDRESS_LENGTH = 254;
const MAX_SUBJECT_LENGTH = 200;
// Parte local sin espacios ni caracteres de control de cabeceras; dominio con al menos un punto.
const ADDRESS_PATTERN =
  /^[A-Za-z0-9._%+'-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,}$/;
const MAILBOX_PATTERN = /^\s*(?:(?<name>[^<>\r\n]*?)\s*<(?<angle>[^<>\s]+)>|(?<bare>[^<>\s]+))\s*$/;
const LINE_BREAKS = /[\r\n]/;

export interface Mailbox {
  /** Nombre visible; ausente si la dirección viene sola. */
  readonly name?: string;
  readonly address: string;
}

export function isValidMailAddress(value: string): boolean {
  return value.length <= MAX_ADDRESS_LENGTH && ADDRESS_PATTERN.test(value);
}

/**
 * Interpreta `persona@ejemplo.com` o `Nombre <persona@ejemplo.com>`. Devuelve `null` si la
 * dirección no es válida o si el nombre trae saltos de línea o comillas (inyección de cabeceras).
 */
export function parseMailbox(value: string): Mailbox | null {
  const groups = MAILBOX_PATTERN.exec(value)?.groups;
  if (!groups) return null;
  const address = groups['angle'] ?? groups['bare'];
  if (address === undefined || !isValidMailAddress(address)) return null;
  const name = groups['name']?.trim();
  if (name && /["\\]/.test(name)) return null;
  return name ? { name, address } : { address };
}

/** Lanza `InvalidMailMessageError` (sin eco de los datos recibidos) si el mensaje no sirve. */
export function validateMailMessage(message: MailMessage): void {
  if (typeof message.to !== 'string' || !isValidMailAddress(message.to)) {
    throw new InvalidMailMessageError('La dirección de destino no es válida.');
  }
  if (
    typeof message.subject !== 'string' ||
    message.subject.trim() === '' ||
    message.subject.length > MAX_SUBJECT_LENGTH ||
    LINE_BREAKS.test(message.subject)
  ) {
    throw new InvalidMailMessageError(
      `El asunto debe tener entre 1 y ${MAX_SUBJECT_LENGTH} caracteres y una sola línea.`,
    );
  }
  if (typeof message.html !== 'string' || message.html.trim() === '') {
    throw new InvalidMailMessageError('El cuerpo HTML del correo no puede estar vacío.');
  }
  if (typeof message.text !== 'string' || message.text.trim() === '') {
    throw new InvalidMailMessageError('El cuerpo en texto del correo no puede estar vacío.');
  }
}
