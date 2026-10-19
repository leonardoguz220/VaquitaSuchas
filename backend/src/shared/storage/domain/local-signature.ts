import { createHmac, timingSafeEqual } from 'node:crypto';
import { encodeKeyForUrl } from './storage-key.js';

// URLs firmadas del driver `local` (research.md R3): ruta del backend con firma HMAC y vencimiento.
// Funciones puras: el instante llega como parámetro y la clave de firma, ya derivada.

/** Prefijo de la ruta del backend que sirve los archivos locales con firma. */
export const LOCAL_FILES_PATH = '/files';

const SIGNING_CONTEXT = 'vaquita:storage-url:v1';

/** Deriva la clave de firma de las URLs a partir de un secreto del servidor (separación de usos). */
export function deriveSigningKey(secret: string): Buffer {
  return createHmac('sha256', secret).update(SIGNING_CONTEXT).digest();
}

function signature(key: string, expiresAt: number, signingKey: Buffer): string {
  return createHmac('sha256', signingKey).update(`${key}\n${expiresAt}`).digest('hex');
}

/** Ruta firmada: `/files/<clave>?expires=<epoch en segundos>&signature=<hex>`. */
export function buildLocalSignedPath(key: string, expiresAt: number, signingKey: Buffer): string {
  const sig = signature(key, expiresAt, signingKey);
  return `${LOCAL_FILES_PATH}/${encodeKeyForUrl(key)}?expires=${expiresAt}&signature=${sig}`;
}

/** `true` si la firma corresponde a la clave y al vencimiento, y `now` aún no lo alcanza. */
export function verifyLocalSignature(
  key: string,
  expiresAt: number,
  providedSignature: string,
  signingKey: Buffer,
  now: Date,
): boolean {
  if (!Number.isInteger(expiresAt) || now.getTime() >= expiresAt * 1000) return false;
  const expected = Buffer.from(signature(key, expiresAt, signingKey), 'hex');
  const provided = Buffer.from(providedSignature, 'hex');
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}
