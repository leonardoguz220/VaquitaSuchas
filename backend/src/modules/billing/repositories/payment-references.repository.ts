import { Injectable } from '@nestjs/common';
import type { Queryable } from '../../../shared/db/db.service.js';

export type ReferenceSource = 'receipt' | 'join_request';

/**
 * Único lugar con SQL sobre `payment_references` (0042_receipts.sql): reserva de referencias de
 * pago por grupo, compartida con las solicitudes de ingreso (spec 010). La clave ya viene
 * normalizada por `normalizeReference`.
 */
@Injectable()
export class PaymentReferencesRepository {
  /**
   * Reserva la referencia en el grupo. `false` si otra reserva activa ya la tiene (CA-002-27,
   * CA-010-41); una referencia liberada o de otro grupo se acepta.
   */
  async reserve(
    q: Queryable,
    input: { groupId: string; referenceKey: string; sourceType: ReferenceSource; sourceId: string },
  ): Promise<boolean> {
    const result = await q.query(
      `INSERT INTO payment_references (group_id, reference_key, source_type, source_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (group_id, reference_key) WHERE released_at IS NULL DO NOTHING`,
      [input.groupId, input.referenceKey, input.sourceType, input.sourceId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  /** Libera las reservas activas de un comprobante o solicitud. Devuelve cuántas liberó. */
  async release(
    q: Queryable,
    sourceType: ReferenceSource,
    sourceId: string,
    now: Date,
  ): Promise<number> {
    const result = await q.query(
      `UPDATE payment_references SET released_at = $3
        WHERE source_type = $1 AND source_id = $2 AND released_at IS NULL`,
      [sourceType, sourceId, now],
    );
    return result.rowCount ?? 0;
  }

  /** ¿La referencia está reservada (activa) en el grupo? */
  async isReserved(q: Queryable, groupId: string, referenceKey: string): Promise<boolean> {
    const result = await q.query(
      `SELECT 1 FROM payment_references
        WHERE group_id = $1 AND reference_key = $2 AND released_at IS NULL`,
      [groupId, referenceKey],
    );
    return (result.rowCount ?? 0) > 0;
  }
}
