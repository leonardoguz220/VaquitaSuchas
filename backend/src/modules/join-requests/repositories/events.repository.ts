import { Injectable } from '@nestjs/common';
import type { Queryable } from '../../../shared/db/db.service.js';

export type RequestEventType =
  | 'abierta'
  | 'datos_pago_enviados'
  | 'plazo_prorrogado'
  | 'comprobante_subido'
  | 'confirmada'
  | 'efectivo_registrado'
  | 'rechazada'
  | 'cancelada'
  | 'expirada'
  | 'recordatorio_enviado'
  | 'reclamo_abierto'
  | 'reclamo_respondido'
  | 'reclamo_resuelto';

export interface NewRequestEvent {
  requestId: string;
  type: RequestEventType;
  /** `null` = el sistema. */
  actorId: string | null;
  fromStatus: string | null;
  toStatus: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown>;
  occurredAt: Date;
}

export interface TimelineRow {
  type: RequestEventType;
  actorId: string | null;
  actorName: string | null;
  fromStatus: string | null;
  toStatus: string | null;
  reason: string | null;
  occurredAt: Date;
}

/**
 * Único lugar con SQL sobre `join_request_events` (0051): línea de tiempo de solo anexado
 * (RF-010-27). No hay operaciones de edición ni borrado.
 */
@Injectable()
export class RequestEventsRepository {
  async insert(q: Queryable, event: NewRequestEvent): Promise<void> {
    await q.query(
      `INSERT INTO join_request_events
         (request_id, type, actor_kind, actor_id, from_status, to_status, reason, metadata, occurred_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)`,
      [
        event.requestId,
        event.type,
        event.actorId === null ? 'sistema' : 'usuario',
        event.actorId,
        event.fromStatus,
        event.toStatus,
        event.reason ?? null,
        JSON.stringify(event.metadata ?? {}),
        event.occurredAt,
      ],
    );
  }

  async listByRequest(q: Queryable, requestId: string): Promise<TimelineRow[]> {
    const result = await q.query<{
      type: RequestEventType;
      actor_id: string | null;
      full_name: string | null;
      from_status: string | null;
      to_status: string | null;
      reason: string | null;
      occurred_at: Date;
    }>(
      `SELECT e.type, e.actor_id, u.full_name, e.from_status, e.to_status, e.reason, e.occurred_at
         FROM join_request_events e LEFT JOIN users u ON u.id = e.actor_id
        WHERE e.request_id = $1
        ORDER BY e.occurred_at, e.created_at, e.id`,
      [requestId],
    );
    return result.rows.map((row) => ({
      type: row.type,
      actorId: row.actor_id,
      actorName: row.full_name,
      fromStatus: row.from_status,
      toStatus: row.to_status,
      reason: row.reason,
      occurredAt: row.occurred_at,
    }));
  }
}
