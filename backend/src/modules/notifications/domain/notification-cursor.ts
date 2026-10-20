/** Posición de la paginación: `created_at` descendente y `id`. Los microsegundos van como texto. */
export interface NotificationCursor {
  createdAt: string;
  id: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;

export function encodeNotificationCursor(cursor: NotificationCursor): string {
  return Buffer.from(`${cursor.createdAt}|${cursor.id}`, 'utf8').toString('base64url');
}

/** `null` si el texto no es un cursor válido (el servicio responde 400). */
export function decodeNotificationCursor(text: string): NotificationCursor | null {
  const [createdAt, id, ...rest] = Buffer.from(text, 'base64url').toString('utf8').split('|');
  if (rest.length > 0 || !createdAt || !id) return null;
  if (!TIMESTAMP.test(createdAt) || !UUID.test(id)) return null;
  return { createdAt, id };
}
