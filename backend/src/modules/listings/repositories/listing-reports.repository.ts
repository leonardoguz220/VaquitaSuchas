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
    input: { listingId: string; reporterId: string; reason: ReportReason; comment: string | null },
  ): Promise<boolean> {
    const result = await q.query(
      `INSERT INTO listing_reports (listing_id, reporter_id, reason, comment)
       VALUES ($1, $2, $3, $4) ON CONFLICT (listing_id, reporter_id) DO NOTHING`,
      [input.listingId, input.reporterId, input.reason, input.comment],
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
}
