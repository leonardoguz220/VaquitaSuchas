const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Fecha ISO con microsegundos tal como la entrega PostgreSQL: el cursor no pierde precisión.
const MICROS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;

export type ListingSort = 'cuota' | 'fecha' | 'puntualidad';
export const LISTING_SORTS: readonly ListingSort[] = ['cuota', 'fecha', 'puntualidad'];

export interface SearchCursor {
  sort: ListingSort;
  /** Valor de la clave de orden (0 para `fecha`). */
  key: number;
  publishedAt: string;
  id: string;
}

/** Cursor opaco `base64url(<orden>|<clave>|<fecha>|<id>)` de la paginación por clave. */
export function encodeSearchCursor(cursor: SearchCursor): string {
  return Buffer.from(
    `${cursor.sort}|${cursor.key}|${cursor.publishedAt}|${cursor.id}`,
    'utf8',
  ).toString('base64url');
}

/** `null` si el cursor está mal formado o es de otro orden (`sort`). */
export function decodeSearchCursor(raw: string, sort: ListingSort): SearchCursor | null {
  const parts = Buffer.from(raw, 'base64url').toString('utf8').split('|');
  if (parts.length !== 4) return null;
  const [cursorSort, keyText, publishedAt, id] = parts as [string, string, string, string];
  const key = Number(keyText);
  if (cursorSort !== sort || !/^-?\d+$/.test(keyText) || !Number.isSafeInteger(key)) return null;
  if (!MICROS.test(publishedAt) || !UUID.test(id)) return null;
  return { sort, key, publishedAt, id };
}
