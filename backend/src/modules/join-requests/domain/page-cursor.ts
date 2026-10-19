const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface PageCursor {
  openedAt: Date;
  id: string;
}

/** Cursor opaco `base64url(<fecha ISO>|<id>)` de la paginación por (opened_at, id). */
export function encodeCursor(cursor: PageCursor): string {
  return Buffer.from(`${cursor.openedAt.toISOString()}|${cursor.id}`, 'utf8').toString('base64url');
}

/** `null` si el cursor está mal formado. */
export function decodeCursor(raw: string): PageCursor | null {
  const text = Buffer.from(raw, 'base64url').toString('utf8');
  const [iso, id, ...rest] = text.split('|');
  if (rest.length > 0 || !iso || !id || !UUID.test(id)) return null;
  const openedAt = new Date(iso);
  if (Number.isNaN(openedAt.getTime()) || openedAt.toISOString() !== iso) return null;
  return { openedAt, id };
}
