import { createHmac, timingSafeEqual } from 'node:crypto';
import { NOTIFICATION_CATEGORIES, type NotificationCategory } from './catalog.js';
import type { DeliveryChannel } from './delivery-rules.js';

// Token de desactivación desde el correo (RF-005-18, CA-005-13): HMAC-SHA256 de usuario, categoría
// y canal con la clave del servidor. No vence y no lleva datos personales (solo el id interno).
// Solo permite desactivar un tipo de aviso; el `GET` de la página no cambia nada (plan §2).

export interface UnsubscribePayload {
  userId: string;
  category: NotificationCategory;
  channel: DeliveryChannel;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CHANNELS_IN_TOKEN: readonly DeliveryChannel[] = ['email', 'telegram'];

const signature = (secret: Buffer | string, p: UnsubscribePayload): string =>
  createHmac('sha256', secret)
    .update(`unsubscribe|${p.userId}|${p.category}|${p.channel}`)
    .digest('base64url');

/** `usuario.categoria.canal.firma` (todo sin puntos internos ni espacios). */
export function signUnsubscribe(secret: Buffer | string, p: UnsubscribePayload): string {
  return `${p.userId}.${p.category}.${p.channel}.${signature(secret, p)}`;
}

/** `null` si el token está mal formado o la firma no coincide. */
export function verifyUnsubscribe(
  secret: Buffer | string,
  token: string,
): UnsubscribePayload | null {
  if (typeof token !== 'string' || token.length > 200) return null;
  const parts = token.split('.');
  if (parts.length !== 4) return null;
  const [userId, category, channel, given] = parts as [string, string, string, string];
  if (!UUID.test(userId)) return null;
  if (!(NOTIFICATION_CATEGORIES as readonly string[]).includes(category)) return null;
  if (!(CHANNELS_IN_TOKEN as readonly string[]).includes(channel)) return null;
  const payload: UnsubscribePayload = {
    userId,
    category: category as NotificationCategory,
    channel: channel as DeliveryChannel,
  };
  const expected = Buffer.from(signature(secret, payload));
  const actual = Buffer.from(given);
  return actual.length === expected.length && timingSafeEqual(actual, expected) ? payload : null;
}
