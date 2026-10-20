/** Posición de «Mis suscripciones»: orden por `joinedAt` descendente y `groupId`. */
export interface GroupListCursor {
  joinedAt: Date;
  groupId: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Texto opaco `base64url(<joinedAt ISO>|<groupId>)`. */
export function encodeGroupListCursor(cursor: GroupListCursor): string {
  return Buffer.from(`${cursor.joinedAt.toISOString()}|${cursor.groupId}`, 'utf8').toString(
    'base64url',
  );
}

/** `null` si el texto no es un cursor válido (el servicio responde 400). */
export function decodeGroupListCursor(text: string): GroupListCursor | null {
  const [iso, groupId, ...rest] = Buffer.from(text, 'base64url').toString('utf8').split('|');
  if (rest.length > 0 || !iso || !groupId || !UUID.test(groupId)) return null;
  const joinedAt = new Date(iso);
  if (Number.isNaN(joinedAt.getTime()) || joinedAt.toISOString() !== iso) return null;
  return { joinedAt, groupId };
}
