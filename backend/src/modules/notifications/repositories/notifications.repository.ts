import { Injectable } from '@nestjs/common';
import type { Queryable } from '../../../shared/db/db.service.js';
import type { NotificationCategory } from '../domain/catalog.js';
import {
  encodeNotificationCursor,
  type NotificationCursor,
} from '../domain/notification-cursor.js';

export interface NewNotification {
  userId: string;
  type: string;
  category: NotificationCategory;
  title: string;
  body: string;
  link: string | null;
  entityType: string | null;
  entityId: string | null;
  dedupeKey: string;
  createdAt: Date;
}

export interface NotificationRecord {
  id: string;
  type: string;
  category: NotificationCategory;
  title: string;
  body: string;
  link: string | null;
  readAt: Date | null;
  createdAt: Date;
}

interface Row {
  id: string;
  type: string;
  category: NotificationCategory;
  title: string;
  body: string;
  link: string | null;
  read_at: Date | null;
  created_at: Date;
  created_at_us: string;
}

const COLUMNS = `id, type, category, title, body, link, read_at, created_at,
  to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at_us`;

const toRecord = (row: Row): NotificationRecord => ({
  id: row.id,
  type: row.type,
  category: row.category,
  title: row.title,
  body: row.body,
  link: row.link,
  readAt: row.read_at,
  createdAt: row.created_at,
});

/**
 * Notificaciones dentro de la app (spec 005, parte A). El contenido es inmutable en la base;
 * solo cambia `read_at`. Todas las lecturas y marcas filtran por `user_id`: nadie ve las de otra
 * persona (CA-005-21).
 */
@Injectable()
export class NotificationsRepository {
  /** Inserta con `ON CONFLICT (dedupe_key) DO NOTHING`. `null` si el aviso ya existía (RNF-005-01). */
  async insert(q: Queryable, n: NewNotification): Promise<string | null> {
    const result = await q.query<{ id: string }>(
      `INSERT INTO notifications
         (user_id, type, category, title, body, link, entity_type, entity_id, dedupe_key,
          created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)
       ON CONFLICT (dedupe_key) DO NOTHING
       RETURNING id`,
      [
        n.userId,
        n.type,
        n.category,
        n.title,
        n.body,
        n.link,
        n.entityType,
        n.entityId,
        n.dedupeKey,
        n.createdAt,
      ],
    );
    return result.rows[0]?.id ?? null;
  }

  /** Más recientes primero. Pide `limit + 1` filas para saber si hay otra página. */
  async list(
    q: Queryable,
    userId: string,
    page: { unreadOnly: boolean; limit: number; after: NotificationCursor | null },
  ): Promise<{ items: NotificationRecord[]; nextCursor: string | null }> {
    const params: unknown[] = [userId];
    const conditions = ['user_id = $1'];
    if (page.unreadOnly) conditions.push('read_at IS NULL');
    if (page.after) {
      params.push(page.after.createdAt, page.after.id);
      conditions.push(`(created_at, id) < ($2::timestamptz, $3::uuid)`);
    }
    params.push(page.limit + 1);
    const result = await q.query<Row>(
      `SELECT ${COLUMNS} FROM notifications WHERE ${conditions.join(' AND ')}
       ORDER BY created_at DESC, id DESC LIMIT $${params.length}`,
      params,
    );
    const hasMore = result.rows.length > page.limit;
    const rows = hasMore ? result.rows.slice(0, page.limit) : result.rows;
    const last = rows[rows.length - 1];
    return {
      items: rows.map(toRecord),
      nextCursor:
        hasMore && last
          ? encodeNotificationCursor({ createdAt: last.created_at_us, id: last.id })
          : null,
    };
  }

  async countUnread(q: Queryable, userId: string): Promise<number> {
    const result = await q.query<{ total: string }>(
      'SELECT count(*) AS total FROM notifications WHERE user_id = $1 AND read_at IS NULL',
      [userId],
    );
    return Number(result.rows[0]?.total ?? 0);
  }

  /** `false` si la notificación no existe o es de otra persona. Marcar dos veces es inocuo. */
  async markRead(q: Queryable, userId: string, id: string, now: Date): Promise<boolean> {
    const result = await q.query(
      `UPDATE notifications SET read_at = COALESCE(read_at, $3)
        WHERE id = $2 AND user_id = $1`,
      [userId, id, now],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async markAllRead(q: Queryable, userId: string, now: Date): Promise<number> {
    const result = await q.query(
      'UPDATE notifications SET read_at = $2 WHERE user_id = $1 AND read_at IS NULL',
      [userId, now],
    );
    return result.rowCount ?? 0;
  }

  /**
   * RN-005-02: marca como `skipped` (`aviso_cancelado`) los envíos pendientes de los avisos de
   * esos tipos para la entidad. Las notificaciones ya creadas dentro de la app no se borran.
   */
  async cancelForEntity(
    q: Queryable,
    entityType: string,
    entityId: string,
    types: readonly string[],
  ): Promise<number> {
    const result = await q.query(
      `UPDATE notification_deliveries d
          SET status = 'skipped', skip_reason = 'aviso_cancelado'
         FROM notifications n
        WHERE d.notification_id = n.id AND d.status = 'pending'
          AND n.entity_type = $1 AND n.entity_id = $2 AND n.type = ANY($3::text[])`,
      [entityType, entityId, types],
    );
    return result.rowCount ?? 0;
  }
}
