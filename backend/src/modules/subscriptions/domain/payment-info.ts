import { detectFileType } from '../../billing/domain/file-signature.js';

export const MAX_PAYMENT_TEXT_LENGTH = 500;
export const MAX_QR_BYTES = 2 * 1024 * 1024;
/** Vigencia de la URL firmada del QR (RF-001-20). */
export const QR_URL_TTL_SECONDS = 600;

export type QrMime = 'image/jpeg' | 'image/png';

export type QrCheck =
  | { ok: true; mime: QrMime; extension: 'jpg' | 'png' }
  | { ok: false; reason: 'empty' | 'too_large' | 'unsupported_type' };

/** Tamaño (≤ 2 MB) y tipo real por firma binaria (solo JPG o PNG) del QR de pago. */
export function checkQrFile(bytes: Uint8Array): QrCheck {
  if (bytes.length === 0) return { ok: false, reason: 'empty' };
  if (bytes.length > MAX_QR_BYTES) return { ok: false, reason: 'too_large' };
  const type = detectFileType(bytes);
  if (type === 'jpeg') return { ok: true, mime: 'image/jpeg', extension: 'jpg' };
  if (type === 'png') return { ok: true, mime: 'image/png', extension: 'png' };
  return { ok: false, reason: 'unsupported_type' };
}

/** Clave del QR en el almacén; la genera el servidor, nunca lleva el nombre del cliente. */
export function qrStorageKey(groupId: string, fileId: string, extension: 'jpg' | 'png'): string {
  return `groups/${groupId}/qr/${fileId}.${extension}`;
}

/** Texto de pago recortado; vacío cuenta como «sin texto»; `null` si pasa de 500 caracteres. */
export function normalizePaymentText(raw: string): { text: string | null } | null {
  const text = raw.trim();
  if (text.length > MAX_PAYMENT_TEXT_LENGTH) return null;
  return { text: text === '' ? null : text };
}
