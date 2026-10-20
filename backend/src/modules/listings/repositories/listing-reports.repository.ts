import { Injectable } from '@nestjs/common';
import type { Queryable } from '../../../shared/db/db.service.js';
import type { ReportInfo } from '../domain/report-rules.js';

export type ReportReason = 'spam' | 'datos_falsos' | 'conducta_indebida' | 'otro';

/** SQL de `listing_reports` (0081): solo inserciones; el titular no puede reportar (disparador). */
@Injectable()
export class ListingReportsRepository {
  /** `false` si el usuario ya había reportado la publicación (`UNIQUE (listing_id, reporter_id)`). */
  async insert(
    q: Queryable,
    input: {
      listingId: string;
      reporterId: string;
      reason: ReportReason;
      comment: string | null;
      createdAt: Date;
    },
  ): Promise<boolean> {
    const result = await q.query(
      `INSERT INTO listing_reports (listing_id, reporter_id, reason, comment, created_at)
       VALUES ($1, $2, $3, $4, $5) ON CONFLICT (listing_id, reporter_id) DO NOTHING`,
      [input.listingId, input.reporterId, input.reason, input.comment, input.createdAt],
    );
    return (result.rowCount ?? 0) === 1;
  }

  async listByListing(q: Queryable, listingId: string): Promise<ReportInfo[]> {
    const result = await q.query<{ reporter_id: string; created_at: Date }>(
      `SELECT reporter_id, created_at FROM listing_reports WHERE listing_id = $1 ORDER BY created_at`,
      [listingId],
    );
    return result.rows.map((row) => ({ reporterId: row.reporter_id, createdAt: row.created_at }));
  }

  /** Reportes distintos desde la última restauración (`reportCount` del titular). */
  async countSince(q: Queryable, listingId: string, since: Date | null): Promise<number> {
    const result = await q.query<{ n: string }>(
      `SELECT count(DISTINCT reporter_id)::text AS n FROM listing_reports
        WHERE listing_id = $1 AND ($2::timestamptz IS NULL OR created_at > $2)`,
      [listingId, since],
    );
    return Number(result.rows[0]?.n ?? 0);
  }

  /** Reportes hechos por la persona desde `since` (límite de 10 por día, contrato 429). */
  async countByReporterSince(q: Queryable, reporterId: string, since: Date): Promise<number> {
    const result = await q.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM listing_reports WHERE reporter_id = $1 AND created_at >= $2`,
      [reporterId, since],
    );
    return Number(result.rows[0]?.n ?? 0);
  }

  /** Publicaciones vivas con reportes desde su última restauración, las más reportadas primero. */
  async listReported(q: Queryable): Promise<ReportedListingRow[]> {
    const result = await q.query<{
      id: string;
      group_id: string;
      group_name: string;
      owner_id: string;
      status: 'activa' | 'oculta';
      hidden_at: Date | null;
      report_count: string;
    }>(
      `SELECT l.id, l.group_id, g.name AS group_name, g.owner_id, l.status, l.hidden_at,
              count(DISTINCT r.reporter_id)::text AS report_count
         FROM listings l
         JOIN groups g ON g.id = l.group_id
         JOIN listing_reports r ON r.listing_id = l.id
          AND (l.moderation_cleared_at IS NULL OR r.created_at > l.moderation_cleared_at)
        WHERE l.status IN ('activa', 'oculta')
        GROUP BY l.id, g.id
        ORDER BY count(DISTINCT r.reporter_id) DESC, l.id`,
    );
    return result.rows.map((row) => ({
      listingId: row.id,
      groupId: row.group_id,
      groupName: row.group_name,
      ownerId: row.owner_id,
      status: row.status,
      hiddenAt: row.hidden_at,
      reportCount: Number(row.report_count),
    }));
  }
}

export interface ReportedListingRow {
  listingId: string;
  groupId: string;
  groupName: string;
  ownerId: string;
  status: 'activa' | 'oculta';
  hiddenAt: Date | null;
  reportCount: number;
}
