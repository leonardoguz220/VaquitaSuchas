import { Injectable } from '@nestjs/common';
import type { Queryable } from '../../../shared/db/db.service.js';

export interface JoinMessageRecord {
  id: string;
  seq: number;
  requestId: string;
  senderId: string;
  body: string | null;
  imageKey: string | null;
  imageMime: string | null;
  imageSizeBytes: number | null;
  createdAt: Date;
}

interface Row {
  id: string;
  seq: string;
  request_id: string;
  sender_id: string;
  body: string | null;
  image_key: string | null;
  image_mime: string | null;
  image_size_bytes: number | null;
  created_at: Date;
}

const COLUMNS =
  'id, seq::text AS seq, request_id, sender_id, body, image_key, image_mime, image_size_bytes, created_at';

const toRecord = (row: Row): JoinMessageRecord => ({
  id: row.id,
  seq: Number(row.seq),
  requestId: row.request_id,
  senderId: row.sender_id,
  body: row.body,
  imageKey: row.image_key,
  imageMime: row.image_mime,
  imageSizeBytes: row.image_size_bytes,
  createdAt: row.created_at,
});

/**
 * Único lugar con SQL sobre `join_messages` y `join_request_reads` (0052). Los mensajes son de
 * solo anexado: no hay `UPDATE` y el `DELETE` es exclusivo de la retención (`RetentionService`).
 */
@Injectable()
export class MessagesRepository {
  async insert(
    q: Queryable,
    input: {
      requestId: string;
      senderId: string;
      body: string | null;
      image?: { key: string; mime: string; sizeBytes: number } | null;
    },
  ): Promise<JoinMessageRecord> {
    const result = await q.query<Row>(
      `INSERT INTO join_messages (request_id, sender_id, body, image_key, image_mime, image_size_bytes)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${COLUMNS}`,
      [
        input.requestId,
        input.senderId,
        input.body,
        input.image?.key ?? null,
        input.image?.mime ?? null,
        input.image?.sizeBytes ?? null,
      ],
    );
    return toRecord(result.rows[0] as Row);
  }

  async findById(
    q: Queryable,
    requestId: string,
    messageId: string,
  ): Promise<JoinMessageRecord | null> {
    const result = await q.query<Row>(
      `SELECT ${COLUMNS} FROM join_messages WHERE request_id = $1 AND id = $2`,
      [requestId, messageId],
    );
    const row = result.rows[0];
    return row ? toRecord(row) : null;
  }

  /** Mensajes con `seq > afterSeq`, en orden ascendente (sondeo con `afterSeq`, R3). */
  async listAfter(
    q: Queryable,
    requestId: string,
    afterSeq: number,
    limit: number,
  ): Promise<JoinMessageRecord[]> {
    const result = await q.query<Row>(
      `SELECT ${COLUMNS} FROM join_messages
        WHERE request_id = $1 AND seq > $2 ORDER BY seq LIMIT $3`,
      [requestId, afterSeq, limit],
    );
    return result.rows.map(toRecord);
  }

  async lastSeq(q: Queryable, requestId: string): Promise<number> {
    const result = await q.query<{ seq: string | null }>(
      'SELECT max(seq)::text AS seq FROM join_messages WHERE request_id = $1',
      [requestId],
    );
    return Number(result.rows[0]?.seq ?? 0);
  }

  /** Mensajes ajenos con `seq > last_read_seq` de esta solicitud. */
  async unreadCount(q: Queryable, requestId: string, userId: string): Promise<number> {
    const result = await q.query<{ n: string }>(
      `SELECT count(*)::text AS n
         FROM join_messages m
         LEFT JOIN join_request_reads r ON r.request_id = m.request_id AND r.user_id = $2
        WHERE m.request_id = $1 AND m.sender_id <> $2 AND m.seq > COALESCE(r.last_read_seq, 0)`,
      [requestId, userId],
    );
    return Number(result.rows[0]?.n ?? 0);
  }

  /** No leídos de las solicitudes donde la persona participa (insignia de la barra). */
  async unreadTotal(q: Queryable, userId: string): Promise<number> {
    const result = await q.query<{ n: string }>(
      `SELECT count(*)::text AS n
         FROM join_messages m
         JOIN join_requests jr ON jr.id = m.request_id
         JOIN groups g ON g.id = jr.group_id
         LEFT JOIN join_request_reads r ON r.request_id = m.request_id AND r.user_id = $1
        WHERE (jr.applicant_id = $1 OR g.owner_id = $1)
          AND m.sender_id <> $1 AND m.seq > COALESCE(r.last_read_seq, 0)`,
      [userId],
    );
    return Number(result.rows[0]?.n ?? 0);
  }

  /** Marca leído hasta `upToSeq`; nunca retrocede. */
  async markRead(q: Queryable, requestId: string, userId: string, upToSeq: number): Promise<void> {
    await q.query(
      `INSERT INTO join_request_reads (request_id, user_id, last_read_seq) VALUES ($1, $2, $3)
       ON CONFLICT (request_id, user_id)
       DO UPDATE SET last_read_seq = GREATEST(join_request_reads.last_read_seq, EXCLUDED.last_read_seq)`,
      [requestId, userId, upToSeq],
    );
  }

  /** Claves de las imágenes del chat (para borrarlas del almacén). */
  async listImageKeys(q: Queryable, requestId: string): Promise<string[]> {
    const result = await q.query<{ image_key: string }>(
      'SELECT image_key FROM join_messages WHERE request_id = $1 AND image_key IS NOT NULL',
      [requestId],
    );
    return result.rows.map((r) => r.image_key);
  }

  /**
   * Borra el chat de la solicitud (retención, RNF-010-09). El disparador de la base solo lo
   * permite si la transacción declara `vaquita.allow_purge = 'on'`, y solo en esta transacción.
   */
  async purgeByRequest(q: Queryable, requestId: string): Promise<number> {
    await q.query("SELECT set_config('vaquita.allow_purge', 'on', true)");
    const result = await q.query('DELETE FROM join_messages WHERE request_id = $1', [requestId]);
    await q.query("SELECT set_config('vaquita.allow_purge', 'off', true)");
    return result.rowCount ?? 0;
  }
}
