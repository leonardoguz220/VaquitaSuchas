import { Injectable } from '@nestjs/common';
import type { Queryable } from '../../../shared/db/db.service.js';
import type { EntryQuote } from '../domain/entry-quote.js';
import type { RequestStatus } from '../domain/request-state.js';

export const ACTIVE_STATUSES: readonly RequestStatus[] = [
  'abierta',
  'esperando_pago',
  'pago_informado',
];

/** Una solicitud de ingreso (`join_requests`, 0050); los bigint llegan como número entero seguro. */
export interface JoinRequestRecord {
  id: string;
  groupId: string;
  applicantId: string;
  source: 'codigo' | 'publicacion';
  listingId: string | null;
  status: RequestStatus;
  openedAt: Date;
  openDeadlineAt: Date;
  quoteAmountCents: number | null;
  quotePriceCents: number | null;
  quoteCurrency: string | null;
  quoteExchangeRate: string | null;
  quoteTotalBsCents: number | null;
  quoteMemberCount: number | null;
  paymentText: string | null;
  paymentQrKey: string | null;
  paymentQrMime: string | null;
  paymentSentAt: Date | null;
  payDeadlineAt: Date | null;
  extendedAt: Date | null;
  proofKey: string | null;
  proofMime: string | null;
  proofSizeBytes: number | null;
  proofMethod: 'qr' | 'transferencia' | null;
  proofReference: string | null;
  proofUploadedAt: Date | null;
  decisionDeadlineAt: Date | null;
  reminderSentAt: Date | null;
  finalAt: Date | null;
  finalReason: string | null;
  decidedBy: string | null;
  rejectReason: string | null;
  rejectedAsFalse: boolean;
  acceptedMethod: 'comprobante' | 'efectivo' | null;
  chargeId: string | null;
  contentPurgedAt: Date | null;
  version: number;
}

interface Row {
  id: string;
  group_id: string;
  applicant_id: string;
  source: 'codigo' | 'publicacion';
  listing_id: string | null;
  status: RequestStatus;
  opened_at: Date;
  open_deadline_at: Date;
  quote_amount_cents: string | null;
  quote_price_cents: string | null;
  quote_currency: string | null;
  quote_exchange_rate: string | null;
  quote_total_bs_cents: string | null;
  quote_member_count: number | null;
  payment_text: string | null;
  payment_qr_key: string | null;
  payment_qr_mime: string | null;
  payment_sent_at: Date | null;
  pay_deadline_at: Date | null;
  extended_at: Date | null;
  proof_key: string | null;
  proof_mime: string | null;
  proof_size_bytes: number | null;
  proof_method: 'qr' | 'transferencia' | null;
  proof_reference: string | null;
  proof_uploaded_at: Date | null;
  decision_deadline_at: Date | null;
  reminder_sent_at: Date | null;
  final_at: Date | null;
  final_reason: string | null;
  decided_by: string | null;
  reject_reason: string | null;
  rejected_as_false: boolean;
  accepted_method: 'comprobante' | 'efectivo' | null;
  charge_id: string | null;
  content_purged_at: Date | null;
  version: number;
}

const COLUMNS = `jr.id, jr.group_id, jr.applicant_id, jr.source, jr.listing_id, jr.status, jr.opened_at,
  jr.open_deadline_at, jr.quote_amount_cents::text AS quote_amount_cents,
  jr.quote_price_cents::text AS quote_price_cents, jr.quote_currency,
  jr.quote_exchange_rate::text AS quote_exchange_rate,
  jr.quote_total_bs_cents::text AS quote_total_bs_cents, jr.quote_member_count, jr.payment_text,
  jr.payment_qr_key, jr.payment_qr_mime, jr.payment_sent_at, jr.pay_deadline_at, jr.extended_at,
  jr.proof_key, jr.proof_mime, jr.proof_size_bytes, jr.proof_method, jr.proof_reference,
  jr.proof_uploaded_at, jr.decision_deadline_at, jr.reminder_sent_at, jr.final_at, jr.final_reason,
  jr.decided_by, jr.reject_reason, jr.rejected_as_false, jr.accepted_method, jr.charge_id,
  jr.content_purged_at, jr.version`;

const num = (value: string | null): number | null => (value === null ? null : Number(value));

function toRecord(row: Row): JoinRequestRecord {
  return {
    id: row.id,
    groupId: row.group_id,
    applicantId: row.applicant_id,
    source: row.source,
    listingId: row.listing_id,
    status: row.status,
    openedAt: row.opened_at,
    openDeadlineAt: row.open_deadline_at,
    quoteAmountCents: num(row.quote_amount_cents),
    quotePriceCents: num(row.quote_price_cents),
    quoteCurrency: row.quote_currency,
    quoteExchangeRate: row.quote_exchange_rate,
    quoteTotalBsCents: num(row.quote_total_bs_cents),
    quoteMemberCount: row.quote_member_count,
    paymentText: row.payment_text,
    paymentQrKey: row.payment_qr_key,
    paymentQrMime: row.payment_qr_mime,
    paymentSentAt: row.payment_sent_at,
    payDeadlineAt: row.pay_deadline_at,
    extendedAt: row.extended_at,
    proofKey: row.proof_key,
    proofMime: row.proof_mime,
    proofSizeBytes: row.proof_size_bytes,
    proofMethod: row.proof_method,
    proofReference: row.proof_reference,
    proofUploadedAt: row.proof_uploaded_at,
    decisionDeadlineAt: row.decision_deadline_at,
    reminderSentAt: row.reminder_sent_at,
    finalAt: row.final_at,
    finalReason: row.final_reason,
    decidedBy: row.decided_by,
    rejectReason: row.reject_reason,
    rejectedAsFalse: row.rejected_as_false,
    acceptedMethod: row.accepted_method,
    chargeId: row.charge_id,
    contentPurgedAt: row.content_purged_at,
    version: row.version,
  };
}

export interface NewJoinRequest {
  groupId: string;
  applicantId: string;
  source: 'codigo' | 'publicacion';
  listingId?: string | null;
  openedAt: Date;
  openDeadlineAt: Date;
}

export type ListScope =
  | { kind: 'applicant'; userId: string }
  | { kind: 'host'; userId: string }
  | { kind: 'either'; userId: string }
  | { kind: 'group'; groupId: string };

export interface ListFilter {
  statuses?: readonly RequestStatus[];
  groupId?: string;
  limit: number;
  cursor?: { openedAt: Date; id: string } | null;
}

/**
 * Único lugar con SQL sobre `join_requests` (0050). Toda acción bloquea la solicitud con
 * `findByIdForUpdate` y, si toca cupos, el grupo DESPUÉS (orden solicitud → grupo, plan §5).
 */
@Injectable()
export class RequestsRepository {
  async insert(q: Queryable, input: NewJoinRequest): Promise<JoinRequestRecord> {
    const result = await q.query<Row>(
      `INSERT INTO join_requests AS jr (group_id, applicant_id, source, listing_id, opened_at, open_deadline_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${COLUMNS}`,
      [
        input.groupId,
        input.applicantId,
        input.source,
        input.listingId ?? null,
        input.openedAt,
        input.openDeadlineAt,
      ],
    );
    return toRecord(result.rows[0] as Row);
  }

  async findById(q: Queryable, id: string): Promise<JoinRequestRecord | null> {
    const result = await q.query<Row>(`SELECT ${COLUMNS} FROM join_requests jr WHERE jr.id = $1`, [
      id,
    ]);
    const row = result.rows[0];
    return row ? toRecord(row) : null;
  }

  async findByIdForUpdate(q: Queryable, id: string): Promise<JoinRequestRecord | null> {
    const result = await q.query<Row>(
      `SELECT ${COLUMNS} FROM join_requests jr WHERE jr.id = $1 FOR UPDATE OF jr`,
      [id],
    );
    const row = result.rows[0];
    return row ? toRecord(row) : null;
  }

  /** Solicitudes activas de la persona, bloqueadas en orden de id (sin interbloqueos). */
  async listActiveByApplicantForUpdate(
    q: Queryable,
    applicantId: string,
  ): Promise<JoinRequestRecord[]> {
    const result = await q.query<Row>(
      `SELECT ${COLUMNS} FROM join_requests jr
        WHERE jr.applicant_id = $1 AND jr.status = ANY($2::text[])
        ORDER BY jr.id FOR UPDATE OF jr`,
      [applicantId, ACTIVE_STATUSES],
    );
    return result.rows.map(toRecord);
  }

  /** Cantidad de solicitudes activas de la persona, en un grupo o en total (RF-010-02). */
  async countActive(q: Queryable, applicantId: string, groupId?: string): Promise<number> {
    const result = await q.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM join_requests
        WHERE applicant_id = $1 AND status = ANY($2::text[]) AND ($3::uuid IS NULL OR group_id = $3)`,
      [applicantId, ACTIVE_STATUSES, groupId ?? null],
    );
    return Number(result.rows[0]?.n ?? 0);
  }

  /**
   * Persiste el vencimiento en un solo `UPDATE` (el disparador de solo lectura final lo exige).
   * `false` si la solicitud ya no estaba en el estado esperado.
   */
  async markExpired(
    q: Queryable,
    id: string,
    from: RequestStatus,
    finalReason: string,
    now: Date,
  ): Promise<boolean> {
    const result = await q.query(
      `UPDATE join_requests
          SET status = 'expirada', final_at = $4, final_reason = $3, version = version + 1
        WHERE id = $1 AND status = $2`,
      [id, from, finalReason, now],
    );
    return (result.rowCount ?? 0) > 0;
  }

  /** Datos de pago configurados en el grupo (spec 001, RF-001-20), para copiarlos a la solicitud. */
  async groupPaymentInfo(
    q: Queryable,
    groupId: string,
  ): Promise<{ text: string | null; qrKey: string | null; qrMime: string | null }> {
    const result = await q.query<{
      payment_info_text: string | null;
      payment_qr_key: string | null;
      payment_qr_mime: string | null;
    }>('SELECT payment_info_text, payment_qr_key, payment_qr_mime FROM groups WHERE id = $1', [
      groupId,
    ]);
    const row = result.rows[0];
    return {
      text: row?.payment_info_text ?? null,
      qrKey: row?.payment_qr_key ?? null,
      qrMime: row?.payment_qr_mime ?? null,
    };
  }

  /** `abierta` → `esperando_pago` con la cotización y los datos de pago (un solo `UPDATE`, RN-010-01). */
  async recordPaymentData(
    q: Queryable,
    id: string,
    data: {
      quote: EntryQuote;
      paymentText: string | null;
      qrKey: string | null;
      qrMime: string | null;
      sentAt: Date;
      payDeadlineAt: Date;
    },
  ): Promise<boolean> {
    const result = await q.query(
      `UPDATE join_requests
          SET status = 'esperando_pago', quote_amount_cents = $2, quote_price_cents = $3,
              quote_currency = $4, quote_exchange_rate = $5, quote_total_bs_cents = $6,
              quote_member_count = $7, payment_text = $8, payment_qr_key = $9,
              payment_qr_mime = $10, payment_sent_at = $11, pay_deadline_at = $12
        WHERE id = $1 AND status = 'abierta'`,
      [
        id,
        data.quote.amountCents,
        data.quote.priceCents,
        data.quote.currency,
        data.quote.exchangeRate,
        data.quote.totalBsCents,
        data.quote.memberCount,
        data.paymentText,
        data.qrKey,
        data.qrMime,
        data.sentAt,
        data.payDeadlineAt,
      ],
    );
    return (result.rowCount ?? 0) > 0;
  }

  /** Prórroga única del plazo de pago (RF-010-28). */
  async recordExtension(
    q: Queryable,
    id: string,
    payDeadlineAt: Date,
    now: Date,
  ): Promise<boolean> {
    const result = await q.query(
      `UPDATE join_requests
          SET pay_deadline_at = $2, extended_at = $3, version = version + 1
        WHERE id = $1 AND status = 'esperando_pago' AND extended_at IS NULL`,
      [id, payDeadlineAt, now],
    );
    return (result.rowCount ?? 0) > 0;
  }

  /** `esperando_pago` → `pago_informado` con el comprobante (RF-010-13). */
  async recordProof(
    q: Queryable,
    id: string,
    proof: {
      key: string;
      mime: string;
      sizeBytes: number;
      method: 'qr' | 'transferencia';
      reference: string;
      uploadedAt: Date;
      decisionDeadlineAt: Date;
    },
  ): Promise<boolean> {
    const result = await q.query(
      `UPDATE join_requests
          SET status = 'pago_informado', proof_key = $2, proof_mime = $3, proof_size_bytes = $4,
              proof_method = $5, proof_reference = $6, proof_uploaded_at = $7,
              decision_deadline_at = $8
        WHERE id = $1 AND status = 'esperando_pago'`,
      [
        id,
        proof.key,
        proof.mime,
        proof.sizeBytes,
        proof.method,
        proof.reference,
        proof.uploadedAt,
        proof.decisionDeadlineAt,
      ],
    );
    return (result.rowCount ?? 0) > 0;
  }

  /** Cupos reservados con plazo vigente (RN-010-02). */
  async countReserved(q: Queryable, groupId: string, now: Date): Promise<number> {
    const result = await q.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM join_requests
        WHERE group_id = $1
          AND ((status = 'esperando_pago' AND pay_deadline_at > $2)
            OR (status = 'pago_informado' AND decision_deadline_at > $2))`,
      [groupId, now],
    );
    return Number(result.rows[0]?.n ?? 0);
  }

  /**
   * Cobros del período vigente que no están cancelados (H3): `charges_member_period_uq` chocaría
   * al confirmar. Los cobros abiertos de otros períodos los cuenta `OpenChargesPort`.
   */
  async countNonCancelledChargesInPeriod(
    q: Queryable,
    groupId: string,
    userId: string,
    period: string,
  ): Promise<number> {
    const result = await q.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM charges
        WHERE group_id = $1 AND user_id = $2 AND period = $3 AND status <> 'cancelado'`,
      [groupId, userId, period],
    );
    return Number(result.rows[0]?.n ?? 0);
  }

  async accountStatus(
    q: Queryable,
    userId: string,
  ): Promise<'activo' | 'suspendido' | 'baneado' | null> {
    const result = await q.query<{ status: 'activo' | 'suspendido' | 'baneado' }>(
      'SELECT status FROM users WHERE id = $1',
      [userId],
    );
    return result.rows[0]?.status ?? null;
  }

  async fullNames(q: Queryable, userIds: readonly string[]): Promise<Map<string, string>> {
    if (userIds.length === 0) return new Map();
    const result = await q.query<{ id: string; full_name: string }>(
      'SELECT id, full_name FROM users WHERE id = ANY($1::uuid[])',
      [userIds],
    );
    return new Map(result.rows.map((row) => [row.id, row.full_name]));
  }

  /**
   * Página de solicitudes. Como solicitante, las más recientes primero; como titular (o por
   * grupo), de la más antigua a la más reciente (RF-010-26). Sin rol, las de ambos papeles con
   * el orden del solicitante. Pide `limit + 1` filas para saber si hay más.
   */
  async list(q: Queryable, scope: ListScope, filter: ListFilter): Promise<JoinRequestRecord[]> {
    const params: unknown[] = [];
    const bind = (value: unknown): string => {
      params.push(value);
      return `$${params.length}`;
    };
    const where: string[] = [];
    let ascending = false;
    switch (scope.kind) {
      case 'applicant':
        where.push(`jr.applicant_id = ${bind(scope.userId)}`);
        break;
      case 'host':
        where.push(`g.owner_id = ${bind(scope.userId)}`);
        ascending = true;
        break;
      case 'either': {
        const user = bind(scope.userId);
        where.push(`(jr.applicant_id = ${user} OR g.owner_id = ${user})`);
        break;
      }
      case 'group':
        where.push(`jr.group_id = ${bind(scope.groupId)}`);
        ascending = true;
        break;
    }
    if (filter.groupId) where.push(`jr.group_id = ${bind(filter.groupId)}`);
    if (filter.statuses && filter.statuses.length > 0) {
      where.push(`jr.status = ANY(${bind(filter.statuses)}::text[])`);
    }
    if (filter.cursor) {
      const op = ascending ? '>' : '<';
      where.push(
        `(jr.opened_at, jr.id) ${op} (${bind(filter.cursor.openedAt)}, ${bind(filter.cursor.id)})`,
      );
    }
    const dir = ascending ? 'ASC' : 'DESC';
    const result = await q.query<Row>(
      `SELECT ${COLUMNS} FROM join_requests jr JOIN groups g ON g.id = jr.group_id
        WHERE ${where.join(' AND ')}
        ORDER BY jr.opened_at ${dir}, jr.id ${dir}
        LIMIT ${bind(filter.limit + 1)}`,
      params,
    );
    return result.rows.map(toRecord);
  }

  /** Solicitudes del titular que esperan una acción suya: `abierta` y `pago_informado` vigentes. */
  async countActionableAsHost(q: Queryable, hostId: string, now: Date): Promise<number> {
    const result = await q.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM join_requests jr JOIN groups g ON g.id = jr.group_id
        WHERE g.owner_id = $1
          AND ((jr.status = 'abierta' AND jr.open_deadline_at > $2)
            OR (jr.status = 'pago_informado' AND jr.decision_deadline_at > $2))`,
      [hostId, now],
    );
    return Number(result.rows[0]?.n ?? 0);
  }

  /** Solicitudes activas vigentes de la persona como solicitante. */
  async countActiveAsApplicant(q: Queryable, applicantId: string, now: Date): Promise<number> {
    const result = await q.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM join_requests
        WHERE applicant_id = $1
          AND ((status = 'abierta' AND open_deadline_at > $2)
            OR (status = 'esperando_pago' AND pay_deadline_at > $2)
            OR (status = 'pago_informado' AND decision_deadline_at > $2))`,
      [applicantId, now],
    );
    return Number(result.rows[0]?.n ?? 0);
  }
}
