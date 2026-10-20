/** Posición del historial: ordenado por período descendente y `id` descendente. */
export interface HistoryCursor {
  period: string;
  id: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Texto opaco `base64url(<período>|<id>)` para el cliente. */
export function encodeHistoryCursor(cursor: HistoryCursor): string {
  return Buffer.from(`${cursor.period}|${cursor.id}`, 'utf8').toString('base64url');
}

/** `null` si el texto no es un cursor válido (el servicio responde 400). */
export function decodeHistoryCursor(text: string): HistoryCursor | null {
  const [period, id, ...rest] = Buffer.from(text, 'base64url').toString('utf8').split('|');
  if (rest.length > 0 || !period || !id || !PERIOD.test(period) || !UUID.test(id)) return null;
  return { period, id };
}
