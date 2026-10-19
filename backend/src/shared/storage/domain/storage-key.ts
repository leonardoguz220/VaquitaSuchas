import { InvalidStorageKeyError } from '../../ports/file-storage.js';

// Reglas puras sobre las claves y la vigencia de las URLs firmadas (RF-000-12). Sin disco ni red.

export const MAX_KEY_LENGTH = 512;
export const MAX_SIGNED_URL_SECONDS = 7 * 24 * 60 * 60;
// Cada tramo: letras, dígitos, punto, guion y guion bajo. Sin espacios ni caracteres de control.
const SEGMENT_PATTERN = /^[A-Za-z0-9._-]+$/;

/** Lanza `InvalidStorageKeyError` si la clave no es una ruta relativa segura. */
export function validateStorageKey(key: string): void {
  if (typeof key !== 'string' || key === '' || key.length > MAX_KEY_LENGTH) {
    throw new InvalidStorageKeyError(`La clave debe tener entre 1 y ${MAX_KEY_LENGTH} caracteres.`);
  }
  for (const segment of key.split('/')) {
    if (segment === '.' || segment === '..' || !SEGMENT_PATTERN.test(segment)) {
      throw new InvalidStorageKeyError(
        'La clave solo admite tramos de letras, dígitos, punto, guion y guion bajo separados por «/», sin «.» ni «..».',
      );
    }
  }
}

export function validateSignedUrlTtl(expiresInSeconds: number): void {
  if (
    !Number.isInteger(expiresInSeconds) ||
    expiresInSeconds < 1 ||
    expiresInSeconds > MAX_SIGNED_URL_SECONDS
  ) {
    throw new InvalidStorageKeyError(
      `La vigencia de la URL debe ser un entero de segundos entre 1 y ${MAX_SIGNED_URL_SECONDS}.`,
    );
  }
}

/** Codifica cada tramo de la clave para usarla en una URL, conservando los «/». */
export function encodeKeyForUrl(key: string): string {
  return key.split('/').map(encodeURIComponent).join('/');
}
