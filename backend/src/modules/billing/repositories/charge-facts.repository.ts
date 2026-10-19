import { Injectable } from '@nestjs/common';
import type { Queryable } from '../../../shared/db/db.service.js';
import type { ChargeFact, ChargeFactsPort } from '../ports/charge-facts.port.js';
import type { ChargeStatus } from '../domain/charge-state.js';
import { punctualityDate } from '../domain/punctuality.js';

interface FactRow {
  id: string;
  user_id: string;
  group_id: string;
  status: ChargeStatus;
  origin: 'ciclo' | 'ingreso';
  due_at: Date;
  paid_at: Date | null;
  settlement: 'comprobante' | 'manual' | 'ingreso' | null;
  first_submitted_at: Date | null;
  last_submitted_at: Date | null;
  had_invalid: boolean;
  frozen_by_ban: boolean;
}

/** Implementa `ChargeFactsPort` con una sola consulta (`charges` + `receipts` + `charge_events` + `groups`). */
@Injectable()
export class ChargeFactsRepository implements ChargeFactsPort {
  async listForUsers(q: Queryable, userIds: readonly string[], since: Date): Promise<ChargeFact[]> {
    if (userIds.length === 0) return [];
    const result = await q.query<FactRow>(
      `SELECT c.id, c.user_id, c.group_id, c.status, c.origin, c.due_at, c.paid_at, c.settlement,
              c.first_submitted_at,
              (SELECT max(r.uploaded_at) FROM receipts r WHERE r.charge_id = c.id)
                AS last_submitted_at,
              EXISTS (SELECT 1 FROM charge_events e
                       WHERE e.charge_id = c.id AND e.type = 'rechazado'
                         AND e.metadata->>'invalidReceipt' = 'true') AS had_invalid,
              (g.frozen_reason = 'titular_baneado') AS frozen_by_ban
         FROM charges c
         JOIN groups g ON g.id = c.group_id
        WHERE c.user_id = ANY($1::uuid[]) AND c.due_at >= $2
        ORDER BY c.due_at, c.id`,
      [[...userIds], since],
    );
    return result.rows.map((row) => {
      const first = row.first_submitted_at;
      const last = row.last_submitted_at ?? first;
      const submissions = first
        ? [{ submittedAt: first }, ...(last ? [{ submittedAt: last }] : [])]
        : [];
      return {
        chargeId: row.id,
        userId: row.user_id,
        groupId: row.group_id,
        status: row.status,
        origin: row.origin,
        dueAt: row.due_at,
        paidAt: row.paid_at,
        settlement: row.settlement,
        firstSubmittedAt: first,
        lastSubmittedAt: last,
        punctualityAt: punctualityDate(
          submissions,
          row.had_invalid
            ? [{ type: 'rejected', invalidReceipt: true, at: last ?? first ?? row.due_at }]
            : [],
        ),
        hadInvalidReceiptRejection: row.had_invalid,
        groupFrozenByBan: row.frozen_by_ban === true,
      };
    });
  }
}
