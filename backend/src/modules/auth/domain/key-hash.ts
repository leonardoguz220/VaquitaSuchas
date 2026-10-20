import { createHmac } from 'node:crypto';

// La IP y el correo de los límites nunca se guardan: solo un HMAC con la clave del servidor.
export function keyHash(key: string, kind: string, value: string): string {
  return createHmac('sha256', key).update(`${kind}:${value}`).digest('hex');
}
