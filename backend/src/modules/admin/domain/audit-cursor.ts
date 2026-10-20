/** Posición de la paginación del log: `occurred_at` descendente y `id`. Los microsegundos van como texto. */
export interface AuditCursor {
  occurredAt: string;
  id: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;

export function encodeAuditCursor(cursor: AuditCursor): string {
  return Buffer.from(`${cursor.occurredAt}|${cursor.id}`, 'utf8').toString('base64url');
}

/** `null` si el texto no es un cursor válido (el servicio responde 400). */
export function decodeAuditCursor(text: string): AuditCursor | null {
  const [occurredAt, id, ...rest] = Buffer.from(text, 'base64url').toString('utf8').split('|');
  if (rest.length > 0 || !occurredAt || !id) return null;
  if (!TIMESTAMP.test(occurredAt) || !UUID.test(id)) return null;
  return { occurredAt, id };
}
