import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Compara dos textos en tiempo constante. Se comparan sus hashes SHA-256 (siempre de 32 bytes)
 * para que `timingSafeEqual` reciba longitudes iguales y la duración no revele la longitud del
 * secreto esperado.
 */
export function constantTimeEquals(received: string, expected: string): boolean {
  const a = createHash('sha256').update(received, 'utf8').digest();
  const b = createHash('sha256').update(expected, 'utf8').digest();
  return timingSafeEqual(a, b);
}
