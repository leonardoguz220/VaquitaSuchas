/** Posición de la paginación del historial del grupo: período, emisión y id, descendentes. */
export interface HistoryCursor {
  period: string;
  issuedAt: Date;
  id: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Texto opaco `base64url(<período>|<issuedAt ISO>|<id>)` para el cliente. */
export function encodeHistoryCursor(cursor: HistoryCursor): string {
  return Buffer.from(
    `${cursor.period}|${cursor.issuedAt.toISOString()}|${cursor.id}`,
    'utf8',
  ).toString('base64url');
}

/** `null` si el texto no es un cursor válido (el servicio responde 400). */
export function decodeHistoryCursor(text: string): HistoryCursor | null {
  const decoded = Buffer.from(text, 'base64url').toString('utf8');
  const [period, iso, id, ...rest] = decoded.split('|');
  if (rest.length > 0 || !period || !iso || !id) return null;
  if (!PERIOD.test(period) || !UUID.test(id)) return null;
  const issuedAt = new Date(iso);
  if (Number.isNaN(issuedAt.getTime()) || issuedAt.toISOString() !== iso) return null;
  return { period, issuedAt, id };
}
