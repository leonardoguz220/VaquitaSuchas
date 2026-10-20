import { Injectable } from '@nestjs/common';
import type { Queryable } from '../../../shared/db/db.service.js';

export interface ModerationReport {
  reason: string;
  comment: string | null;
  createdAt: string;
}

export interface ModerationQueueItem {
  listingId: string;
  groupId: string;
  groupName: string;
  serviceName: string;
  status: 'activa' | 'oculta';
  slotsOffered: number;
  description: string | null;
  publishedAt: string;
  hiddenAt: string | null;
  reportCount: number;
  reports: ModerationReport[];
}

export interface ListingForModeration {
  listingId: string;
  groupId: string;
  groupName: string;
  status: string;
  ownerId: string;
}

export const QUEUE_LIMIT = 100;

/** SQL de la moderación de publicaciones (spec 009, US6) sobre `listings` y `listing_reports`. */
@Injectable()
export class ListingsModerationRepository {
  /**
   * Publicaciones ocultas o con reportes desde la última restauración, las ocultas primero y luego
   * por cantidad de reportes. No expone quién reportó, solo motivos y comentarios (RF-009-12).
   */
  async queue(q: Queryable): Promise<ModerationQueueItem[]> {
    const result = await q.query<{
      id: string;
      group_id: string;
      name: string;
      service_name_snapshot: string;
      status: 'activa' | 'oculta';
      slots_offered: number;
      description: string | null;
      published_at: Date;
      hidden_at: Date | null;
      reports: { reason: string; comment: string | null; createdAt: string }[];
    }>(
      `SELECT l.id, l.group_id, g.name, g.service_name_snapshot, l.status, l.slots_offered,
              l.description, l.published_at, l.hidden_at,
              COALESCE((SELECT json_agg(json_build_object('reason', r.reason, 'comment', r.comment,
                                                         'createdAt', r.created_at)
                                        ORDER BY r.created_at)
                          FROM listing_reports r
                         WHERE r.listing_id = l.id
                           AND (l.moderation_cleared_at IS NULL
                                OR r.created_at > l.moderation_cleared_at)), '[]'::json) AS reports
         FROM listings l JOIN groups g ON g.id = l.group_id
        WHERE l.status IN ('activa', 'oculta')
          AND (l.status = 'oculta'
               OR EXISTS (SELECT 1 FROM listing_reports r
                           WHERE r.listing_id = l.id
                             AND (l.moderation_cleared_at IS NULL
                                  OR r.created_at > l.moderation_cleared_at)))
        ORDER BY (l.status = 'oculta') DESC, l.hidden_at NULLS LAST, l.published_at, l.id
        LIMIT ${QUEUE_LIMIT}`,
    );
    return result.rows.map((r) => ({
      listingId: r.id,
      groupId: r.group_id,
      groupName: r.name,
      serviceName: r.service_name_snapshot,
      status: r.status,
      slotsOffered: r.slots_offered,
      description: r.description,
      publishedAt: r.published_at.toISOString(),
      hiddenAt: r.hidden_at ? r.hidden_at.toISOString() : null,
      reportCount: r.reports.length,
      reports: r.reports,
    }));
  }

  /** Bloquea la publicación y trae a quién pertenece (el titular actual del grupo). */
  async lock(q: Queryable, listingId: string): Promise<ListingForModeration | null> {
    const result = await q.query<{
      id: string;
      group_id: string;
      name: string;
      status: string;
      owner_id: string;
    }>(
      `SELECT l.id, l.group_id, g.name, l.status, g.owner_id
         FROM listings l JOIN groups g ON g.id = l.group_id
        WHERE l.id = $1 FOR UPDATE OF l`,
      [listingId],
    );
    const row = result.rows[0];
    return row
      ? {
          listingId: row.id,
          groupId: row.group_id,
          groupName: row.name,
          status: row.status,
          ownerId: row.owner_id,
        }
      : null;
  }

  /** Vuelve a la búsqueda; los reportes anteriores ya no cuentan (`moderation_cleared_at`). */
  async restore(q: Queryable, listingId: string, now: Date): Promise<void> {
    await q.query(
      `UPDATE listings SET status = 'activa', hidden_at = NULL, moderation_cleared_at = $2
        WHERE id = $1`,
      [listingId, now],
    );
  }

  /** Cierre definitivo por moderación. */
  async close(q: Queryable, listingId: string, now: Date): Promise<void> {
    await q.query(
      `UPDATE listings SET status = 'cerrada', hidden_at = NULL, ended_at = $2, end_reason = 'moderacion'
        WHERE id = $1`,
      [listingId, now],
    );
  }

  /** Decisiones ya tomadas sobre la publicación: distingue repeticiones legítimas del aviso. */
  async decisionCount(q: Queryable, listingId: string): Promise<number> {
    const result = await q.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM admin_audit_log WHERE target_id = $1 AND target_type = 'listing'`,
      [listingId],
    );
    return Number(result.rows[0]?.n ?? 0);
  }
}
