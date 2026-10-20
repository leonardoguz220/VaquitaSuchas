/** Posición de las listas del panel: ordenadas por `due_at` ascendente y `id`. */
export interface ListCursor {
  dueAt: Date;
  id: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Texto opaco `base64url(<dueAt ISO>|<id>)` para el cliente. */
export function encodeListCursor(cursor: ListCursor): string {
  return Buffer.from(`${cursor.dueAt.toISOString()}|${cursor.id}`, 'utf8').toString('base64url');
}

/** `null` si el texto no es un cursor válido (el servicio responde 400). */
export function decodeListCursor(text: string): ListCursor | null {
  const decoded = Buffer.from(text, 'base64url').toString('utf8');
  const [iso, id, ...rest] = decoded.split('|');
  if (rest.length > 0 || !iso || !id || !UUID.test(id)) return null;
  const dueAt = new Date(iso);
  if (Number.isNaN(dueAt.getTime()) || dueAt.toISOString() !== iso) return null;
  return { dueAt, id };
}
