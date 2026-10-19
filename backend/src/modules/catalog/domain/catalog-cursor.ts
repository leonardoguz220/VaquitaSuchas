export interface ServiceCursor {
  name: string;
  id: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Cursor opaco del listado: posición `(name, id)` del último servicio entregado. */
export function encodeServiceCursor(cursor: ServiceCursor): string {
  return Buffer.from(JSON.stringify([cursor.name, cursor.id]), 'utf8').toString('base64url');
}

/** `null` si el texto no es un cursor válido. */
export function decodeServiceCursor(raw: string): ServiceCursor | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (!Array.isArray(parsed) || parsed.length !== 2) return null;
    const [name, id] = parsed as unknown[];
    if (typeof name !== 'string' || typeof id !== 'string' || !UUID.test(id)) return null;
    return { name, id };
  } catch {
    return null;
  }
}
