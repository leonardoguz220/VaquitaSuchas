import type { BillingHarness } from './billing-harness.js';
import { ReportsFixtures, type ReportsGroup } from './reports-fixtures.js';

/** Instantes de la prueba (La Paz = UTC−4): vence al empezar el 2026-08-19 UTC, es decir el día 18 completo. */
export const ON_TIME = '2026-08-18T12:00:00Z';
export const LATE = '2026-08-22T12:00:00Z';

export interface FactOptions {
  period?: string;
  /** Instante de la primera subida de comprobante; `null` si nunca subió. */
  submittedAt?: 'ontime' | 'late' | null;
  /** Estado final deseado. */
  status?: 'pagado' | 'atrasado' | 'pendiente' | 'cancelado' | 'en_revision';
  /** Pago manual en ese instante en lugar de comprobante. */
  manualPaidAt?: string;
}

/** Cobros con hechos de puntualidad a medida para la reputación (spec 007). */
export class ReputationFixtures {
  readonly reports: ReportsFixtures;

  constructor(private readonly harness: BillingHarness) {
    this.reports = new ReportsFixtures(harness);
  }

  /** Cobro del miembro que vence en el período, con la primera subida y el estado pedidos. */
  async fact(group: ReportsGroup, userId: string, options: FactOptions = {}): Promise<string> {
    const period = options.period ?? '2026-08';
    const id = await this.reports.charge(group, userId, { period, amountCents: 1000 });
    const pool = this.harness.pool;
    const status = options.status ?? 'pagado';
    if (status === 'pendiente') return id;
    if (status === 'cancelado') {
      await pool.query(
        `UPDATE charges SET status = 'cancelado', cancelled_at = now(), cancelled_by = $2,
                            cancel_reason = 'Cancelado en la prueba' WHERE id = $1`,
        [id, group.ownerId],
      );
      return id;
    }
    if (options.manualPaidAt) {
      await pool.query(
        `UPDATE charges SET status = 'pagado', paid_at = $2, settled_by = $3, settlement = 'manual'
          WHERE id = $1`,
        [id, options.manualPaidAt, group.ownerId],
      );
      return id;
    }
    const choice = options.submittedAt === undefined ? 'ontime' : options.submittedAt;
    const submittedAt =
      choice === null ? null : `${period}-${choice === 'ontime' ? '18T12' : '22T12'}:00:00Z`;
    if (submittedAt !== null) {
      await pool.query(
        `UPDATE charges SET status = 'en_revision', first_submitted_at = $2 WHERE id = $1`,
        [id, submittedAt],
      );
      await this.receipt(id, userId, submittedAt);
    }
    if (status === 'atrasado') {
      await pool.query(`UPDATE charges SET status = 'atrasado' WHERE id = $1`, [id]);
    } else if (status === 'pagado') {
      await pool.query(
        `UPDATE charges SET status = 'pagado', paid_at = $2, settled_by = $3, settlement = 'comprobante'
          WHERE id = $1`,
        [id, submittedAt, group.ownerId],
      );
    }
    return id;
  }

  async receipt(chargeId: string, uploadedBy: string, uploadedAt: string): Promise<void> {
    await this.harness.pool.query(
      `INSERT INTO receipts (charge_id, uploaded_by, file_key, mime, size_bytes, method, reference,
                             uploaded_at)
       VALUES ($1, $2, $3, 'image/png', 4, 'qr', $4, $5)`,
      [
        chargeId,
        uploadedBy,
        `receipts/test/${chargeId}/${uploadedAt}.png`,
        `REF-${uploadedAt}`,
        uploadedAt,
      ],
    );
  }

  /** Rechazo del titular, con o sin la marca «comprobante inválido». */
  async rejection(
    chargeId: string,
    groupId: string,
    ownerId: string,
    invalid: boolean,
  ): Promise<void> {
    await this.harness.pool.query(
      `UPDATE receipts SET status = 'rechazado' WHERE charge_id = $1 AND status = 'vigente'`,
      [chargeId],
    );
    await this.harness.pool.query(
      `INSERT INTO charge_events (charge_id, group_id, type, actor_kind, actor_id, reason, metadata,
                                  occurred_at)
       VALUES ($1, $2, 'rechazado', 'usuario', $3, 'Rechazado en la prueba', $4::jsonb, now())`,
      [chargeId, groupId, ownerId, JSON.stringify({ invalidReceipt: invalid })],
    );
  }
}
