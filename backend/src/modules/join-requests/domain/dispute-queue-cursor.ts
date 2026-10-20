/** Posición de la cola de reclamos: abiertos primero (`rank` 0), luego por fecha y id ascendentes. */
export interface DisputeQueueCursor {
  rank: 0 | 1;
  openedAt: string;
  id: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;

export function encodeDisputeQueueCursor(cursor: DisputeQueueCursor): string {
  return Buffer.from(`${cursor.rank}|${cursor.openedAt}|${cursor.id}`, 'utf8').toString(
    'base64url',
  );
}

/** `null` si el texto no es un cursor válido (el servicio responde 400). */
export function decodeDisputeQueueCursor(raw: string): DisputeQueueCursor | null {
  const [rank, openedAt, id, ...rest] = Buffer.from(raw, 'base64url').toString('utf8').split('|');
  if (rest.length > 0 || (rank !== '0' && rank !== '1') || !openedAt || !id) return null;
  if (!TIMESTAMP.test(openedAt) || !UUID.test(id)) return null;
  return { rank: rank === '0' ? 0 : 1, openedAt, id };
}
