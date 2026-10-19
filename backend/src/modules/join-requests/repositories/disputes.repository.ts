import { Injectable } from '@nestjs/common';
import type { Queryable } from '../../../shared/db/db.service.js';

export type DisputeKindValue = 'pago_sin_ingreso' | 'comprobante_falso';

export interface DisputeRecord {
  id: string;
  requestId: string;
  kind: DisputeKindValue;
  openedBy: string;
  accusedId: string;
  description: string;
  evidenceKey: string | null;
  evidenceMime: string | null;
  openedAt: Date;
  responseText: string | null;
  responseEvidenceKey: string | null;
  responseEvidenceMime: string | null;
  respondedAt: Date | null;
  status: 'abierto' | 'resuelto';
  resolution: 'estafa_confirmada' | 'sin_falta' | null;
  resolutionReason: string | null;
  resolvedBy: string | null;
  resolvedAt: Date | null;
  evidencePurgedAt: Date | null;
}

interface Row {
  id: string;
  request_id: string;
  kind: DisputeKindValue;
  opened_by: string;
  accused_id: string;
  description: string;
  evidence_key: string | null;
  evidence_mime: string | null;
  opened_at: Date;
  response_text: string | null;
  response_evidence_key: string | null;
  response_evidence_mime: string | null;
  responded_at: Date | null;
  status: 'abierto' | 'resuelto';
  resolution: 'estafa_confirmada' | 'sin_falta' | null;
  resolution_reason: string | null;
  resolved_by: string | null;
  resolved_at: Date | null;
  evidence_purged_at: Date | null;
}

const COLUMNS = `id, request_id, kind, opened_by, accused_id, description, evidence_key, evidence_mime,
  opened_at, response_text, response_evidence_key, response_evidence_mime, responded_at, status,
  resolution, resolution_reason, resolved_by, resolved_at, evidence_purged_at`;

const toRecord = (row: Row): DisputeRecord => ({
  id: row.id,
  requestId: row.request_id,
  kind: row.kind,
  openedBy: row.opened_by,
  accusedId: row.accused_id,
  description: row.description,
  evidenceKey: row.evidence_key,
  evidenceMime: row.evidence_mime,
  openedAt: row.opened_at,
  responseText: row.response_text,
  responseEvidenceKey: row.response_evidence_key,
  responseEvidenceMime: row.response_evidence_mime,
  respondedAt: row.responded_at,
  status: row.status,
  resolution: row.resolution,
  resolutionReason: row.resolution_reason,
  resolvedBy: row.resolved_by,
  resolvedAt: row.resolved_at,
  evidencePurgedAt: row.evidence_purged_at,
});

/** Único lugar con SQL sobre `join_disputes` (0053). */
@Injectable()
export class DisputesRepository {
  async insert(
    q: Queryable,
    input: {
      requestId: string;
      kind: DisputeKindValue;
      openedBy: string;
      accusedId: string;
      description: string;
      evidence?: { key: string; mime: string } | null;
      openedAt: Date;
    },
  ): Promise<DisputeRecord> {
    const result = await q.query<Row>(
      `INSERT INTO join_disputes (request_id, kind, opened_by, accused_id, description,
                                  evidence_key, evidence_mime, opened_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING ${COLUMNS}`,
      [
        input.requestId,
        input.kind,
        input.openedBy,
        input.accusedId,
        input.description,
        input.evidence?.key ?? null,
        input.evidence?.mime ?? null,
        input.openedAt,
      ],
    );
    return toRecord(result.rows[0] as Row);
  }

  async findByIdForUpdate(
    q: Queryable,
    requestId: string,
    disputeId: string,
  ): Promise<DisputeRecord | null> {
    const result = await q.query<Row>(
      `SELECT ${COLUMNS} FROM join_disputes WHERE request_id = $1 AND id = $2 FOR UPDATE`,
      [requestId, disputeId],
    );
    const row = result.rows[0];
    return row ? toRecord(row) : null;
  }

  async listByRequest(q: Queryable, requestId: string): Promise<DisputeRecord[]> {
    const result = await q.query<Row>(
      `SELECT ${COLUMNS} FROM join_disputes WHERE request_id = $1 ORDER BY opened_at, id`,
      [requestId],
    );
    return result.rows.map(toRecord);
  }

  /** Una sola respuesta por reclamo (la base lo impone con `join_disputes_single_response`). */
  async saveResponse(
    q: Queryable,
    disputeId: string,
    input: { text: string; evidence?: { key: string; mime: string } | null; respondedAt: Date },
  ): Promise<DisputeRecord> {
    const result = await q.query<Row>(
      `UPDATE join_disputes
          SET response_text = $2, response_evidence_key = $3, response_evidence_mime = $4,
              responded_at = $5
        WHERE id = $1 RETURNING ${COLUMNS}`,
      [
        disputeId,
        input.text,
        input.evidence?.key ?? null,
        input.evidence?.mime ?? null,
        input.respondedAt,
      ],
    );
    return toRecord(result.rows[0] as Row);
  }

  async resolve(
    q: Queryable,
    disputeId: string,
    input: {
      resolution: 'estafa_confirmada' | 'sin_falta';
      reason: string;
      resolvedBy: string;
      resolvedAt: Date;
    },
  ): Promise<DisputeRecord> {
    const result = await q.query<Row>(
      `UPDATE join_disputes
          SET status = 'resuelto', resolution = $2, resolution_reason = $3, resolved_by = $4,
              resolved_at = $5
        WHERE id = $1 RETURNING ${COLUMNS}`,
      [disputeId, input.resolution, input.reason, input.resolvedBy, input.resolvedAt],
    );
    return toRecord(result.rows[0] as Row);
  }
}
