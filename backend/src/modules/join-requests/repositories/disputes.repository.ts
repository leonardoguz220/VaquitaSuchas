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

/** Fila de la cola de administración: sin descripción, chat ni comprobante (RF-009-20). */
export interface QueueRecord {
  id: string;
  requestId: string;
  kind: DisputeKindValue;
  status: 'abierto' | 'resuelto';
  openedBy: { userId: string; fullName: string };
  accused: { userId: string; fullName: string };
  openedAt: Date;
  openedAtText: string;
  respondedAt: Date | null;
  resolvedAt: Date | null;
}

interface QueueRow {
  id: string;
  request_id: string;
  kind: DisputeKindValue;
  status: 'abierto' | 'resuelto';
  opened_by: string;
  accused_id: string;
  opened_at: Date;
  opened_text: string;
  responded_at: Date | null;
  resolved_at: Date | null;
  opener_name: string;
  accused_name: string;
}

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

  async findById(
    q: Queryable,
    disputeId: string,
    forUpdate = false,
  ): Promise<DisputeRecord | null> {
    const result = await q.query<Row>(
      `SELECT ${COLUMNS} FROM join_disputes WHERE id = $1${forUpdate ? ' FOR UPDATE' : ''}`,
      [disputeId],
    );
    const row = result.rows[0];
    return row ? toRecord(row) : null;
  }

  /** Titular actual del grupo (el acusado de un `pago_sin_ingreso`). */
  async hostOf(q: Queryable, groupId: string): Promise<string> {
    const result = await q.query<{ owner_id: string }>(
      'SELECT owner_id FROM groups WHERE id = $1',
      [groupId],
    );
    return (result.rows[0] as { owner_id: string }).owner_id;
  }

  async namesOf(q: Queryable, userIds: readonly string[]): Promise<Map<string, string>> {
    const result = await q.query<{ id: string; full_name: string }>(
      'SELECT id, full_name FROM users WHERE id = ANY($1::uuid[])',
      [userIds],
    );
    return new Map(result.rows.map((r) => [r.id, r.full_name]));
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

  /** Cola de reclamos: abiertos primero, del más antiguo al más reciente (keyset por rango, fecha e id). */
  async listQueue(
    q: Queryable,
    options: {
      status: 'abierto' | 'resuelto' | null;
      limit: number;
      after: { rank: number; openedAt: string; id: string } | null;
    },
  ): Promise<QueueRecord[]> {
    const result = await q.query<QueueRow>(
      `SELECT d.id, d.request_id, d.kind, d.status, d.opened_by, d.accused_id, d.opened_at,
              to_char(d.opened_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS opened_text,
              d.responded_at, d.resolved_at, o.full_name AS opener_name, a.full_name AS accused_name
         FROM join_disputes d
         JOIN users o ON o.id = d.opened_by
         JOIN users a ON a.id = d.accused_id
        WHERE ($1::text IS NULL OR d.status = $1)
          AND ($2::int IS NULL
               OR (CASE WHEN d.status = 'abierto' THEN 0 ELSE 1 END, d.opened_at, d.id)
                  > ($2::int, $3::timestamptz, $4::uuid))
        ORDER BY CASE WHEN d.status = 'abierto' THEN 0 ELSE 1 END, d.opened_at, d.id
        LIMIT $5`,
      [
        options.status,
        options.after?.rank ?? null,
        options.after?.openedAt ?? null,
        options.after?.id ?? null,
        options.limit,
      ],
    );
    return result.rows.map((r) => ({
      id: r.id,
      requestId: r.request_id,
      kind: r.kind,
      status: r.status,
      openedBy: { userId: r.opened_by, fullName: r.opener_name },
      accused: { userId: r.accused_id, fullName: r.accused_name },
      openedAt: r.opened_at,
      openedAtText: r.opened_text,
      respondedAt: r.responded_at,
      resolvedAt: r.resolved_at,
    }));
  }

  /** Marca la evidencia de los reclamos de la solicitud como eliminada del almacén (retención). */
  async markEvidencePurged(q: Queryable, requestId: string, now: Date): Promise<void> {
    await q.query(
      `UPDATE join_disputes SET evidence_purged_at = $2
        WHERE request_id = $1 AND evidence_purged_at IS NULL`,
      [requestId, now],
    );
  }
}
