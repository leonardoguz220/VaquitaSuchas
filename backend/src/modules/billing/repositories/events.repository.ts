import { Injectable } from '@nestjs/common';
import type { Queryable } from '../../../shared/db/db.service.js';
import type { ChargeStatus } from '../domain/charge-state.js';

export type ChargeEventType =
  | 'generado'
  | 'ingreso_registrado'
  | 'comprobante_subido'
  | 'comprobante_reemplazado'
  | 'rechazado'
  | 'confirmado'
  | 'pago_manual'
  | 'atrasado'
  | 'cancelado'
  | 'retiro_por_mora';

export interface NewChargeEvent {
  chargeId: string;
  groupId: string;
  type: ChargeEventType;
  /** `null` = el sistema; un evento de usuario siempre nombra a la persona. */
  actorId: string | null;
  fromStatus?: ChargeStatus | null;
  toStatus?: ChargeStatus | null;
  reason?: string | null;
  metadata?: Record<string, unknown>;
  occurredAt: Date;
}

export interface ChargeEventRecord {
  id: string;
  chargeId: string;
  groupId: string;
  type: ChargeEventType;
  actorKind: 'usuario' | 'sistema';
  actorId: string | null;
  fromStatus: ChargeStatus | null;
  toStatus: ChargeStatus | null;
  reason: string | null;
  metadata: Record<string, unknown>;
  occurredAt: Date;
}

interface EventRow {
  id: string;
  charge_id: string;
  group_id: string;
  type: ChargeEventType;
  actor_kind: 'usuario' | 'sistema';
  actor_id: string | null;
  from_status: ChargeStatus | null;
  to_status: ChargeStatus | null;
  reason: string | null;
  metadata: Record<string, unknown>;
  occurred_at: Date;
}

const COLUMNS = `id, charge_id, group_id, type, actor_kind, actor_id, from_status, to_status,
  reason, metadata, occurred_at`;

const toRecord = (row: EventRow): ChargeEventRecord => ({
  id: row.id,
  chargeId: row.charge_id,
  groupId: row.group_id,
  type: row.type,
  actorKind: row.actor_kind,
  actorId: row.actor_id,
  fromStatus: row.from_status,
  toStatus: row.to_status,
  reason: row.reason,
  metadata: row.metadata,
  occurredAt: row.occurred_at,
});

/** Único lugar con SQL sobre `charge_events` (0044): tabla de solo anexado, sin UPDATE ni DELETE. */
@Injectable()
export class ChargeEventsRepository {
  async append(q: Queryable, event: NewChargeEvent): Promise<ChargeEventRecord> {
    const result = await q.query<EventRow>(
      `INSERT INTO charge_events (charge_id, group_id, type, actor_kind, actor_id, from_status,
                                  to_status, reason, metadata, occurred_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)
       RETURNING ${COLUMNS}`,
      [
        event.chargeId,
        event.groupId,
        event.type,
        event.actorId === null ? 'sistema' : 'usuario',
        event.actorId,
        event.fromStatus ?? null,
        event.toStatus ?? null,
        event.reason ?? null,
        JSON.stringify(event.metadata ?? {}),
        event.occurredAt,
      ],
    );
    return toRecord(result.rows[0] as EventRow);
  }

  /** Línea de tiempo del cobro, en orden cronológico (RF-002-17). */
  async listByCharge(q: Queryable, chargeId: string): Promise<ChargeEventRecord[]> {
    const result = await q.query<EventRow>(
      `SELECT ${COLUMNS} FROM charge_events WHERE charge_id = $1 ORDER BY occurred_at, id`,
      [chargeId],
    );
    return result.rows.map(toRecord);
  }

  /** Líneas de tiempo de varios cobros a la vez (lista "Mis cobros"), en orden cronológico. */
  async listByCharges(q: Queryable, chargeIds: readonly string[]): Promise<ChargeEventRecord[]> {
    if (chargeIds.length === 0) return [];
    const result = await q.query<EventRow>(
      `SELECT ${COLUMNS} FROM charge_events WHERE charge_id = ANY($1::uuid[])
        ORDER BY occurred_at, id`,
      [[...chargeIds]],
    );
    return result.rows.map(toRecord);
  }

  /**
   * Historial del grupo, el más reciente primero. `before` pagina por fecha (eventos estrictamente
   * anteriores); `limit` lo fija el servicio.
   */
  async listByGroup(
    q: Queryable,
    groupId: string,
    limit: number,
    before: Date | null = null,
  ): Promise<ChargeEventRecord[]> {
    const result = await q.query<EventRow>(
      `SELECT ${COLUMNS} FROM charge_events
        WHERE group_id = $1 AND ($2::timestamptz IS NULL OR occurred_at < $2)
        ORDER BY occurred_at DESC, id DESC
        LIMIT $3`,
      [groupId, before, limit],
    );
    return result.rows.map(toRecord);
  }
}
