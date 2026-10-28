import { NOW, type BillingHarness, type TestGroup } from './billing-harness.js';

/** Fija el reloj falso (el reloj solo sabe avanzar; las pruebas de plazos necesitan volver a `NOW`). */
export function setClock(harness: BillingHarness, iso: string): void {
  Object.assign(harness.clock, { current: Date.parse(iso) });
}

export type SeedState =
  'abierta' | 'esperando_pago' | 'pago_informado' | 'rechazada' | 'cancelada' | 'expirada';

export interface SeedOptions {
  /** Instante de apertura; por omisión, `NOW` de las pruebas. */
  openedAt?: string;
  /** Plazos en minutos desde `openedAt` (por omisión vigentes). */
  openMinutes?: number;
}

const minutes = (base: string, delta: number): string =>
  new Date(Date.parse(base) + delta * 60_000).toISOString();

/**
 * Inserta una solicitud y la lleva al estado pedido con las transiciones válidas de RN-010-05
 * (la base impone `version + 1` por cambio de estado y que un estado final sea de solo lectura).
 */
export async function seedRequest(
  harness: BillingHarness,
  group: Pick<TestGroup, 'id'>,
  applicantId: string,
  state: SeedState,
  options: SeedOptions = {},
): Promise<string> {
  const openedAt = options.openedAt ?? NOW;
  const inserted = await harness.pool.query<{ id: string }>(
    `INSERT INTO join_requests (group_id, applicant_id, opened_at, open_deadline_at)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [group.id, applicantId, openedAt, minutes(openedAt, options.openMinutes ?? 24 * 60)],
  );
  const id = (inserted.rows[0] as { id: string }).id;
  await harness.pool.query(
    `INSERT INTO join_request_events (request_id, type, actor_kind, actor_id, to_status, occurred_at)
     VALUES ($1, 'abierta', 'usuario', $2, 'abierta', $3)`,
    [id, applicantId, openedAt],
  );
  if (state === 'abierta') return id;

  if (state === 'cancelada') {
    await harness.pool.query(
      `UPDATE join_requests SET status = 'cancelada', final_at = $2,
              final_reason = 'cancelada_solicitante', version = version + 1 WHERE id = $1`,
      [id, openedAt],
    );
    return id;
  }
  if (state === 'expirada') {
    await harness.pool.query(
      `UPDATE join_requests SET status = 'expirada', final_at = $2,
              final_reason = 'plazo_solicitud', version = version + 1 WHERE id = $1`,
      [id, openedAt],
    );
    return id;
  }
  if (state === 'rechazada') {
    await harness.pool.query(
      `UPDATE join_requests SET status = 'rechazada', final_at = $2, final_reason = 'rechazo_titular',
              reject_reason = 'Sin cupo para ti',
              decided_by = (SELECT owner_id FROM groups WHERE id = join_requests.group_id), version = version + 1 WHERE id = $1`,
      [id, openedAt],
    );
    return id;
  }

  await harness.pool.query(
    `UPDATE join_requests
        SET status = 'esperando_pago', quote_amount_cents = 3333, quote_price_cents = 10001,
            quote_currency = 'BS', quote_total_bs_cents = 10001, quote_member_count = 3,
            payment_text = 'Transferir a la cuenta 123', payment_sent_at = $2,
            pay_deadline_at = $3, version = version + 1
      WHERE id = $1`,
    [id, openedAt, minutes(openedAt, 15 + 60 * 24)],
  );
  if (state === 'pago_informado') {
    await harness.pool.query(
      `UPDATE join_requests
          SET status = 'pago_informado', proof_key = 'proofs/test.png', proof_mime = 'image/png',
              proof_size_bytes = 4, proof_method = 'qr', proof_reference = 'REF-1',
              proof_uploaded_at = $2, decision_deadline_at = $3, version = version + 1
        WHERE id = $1`,
      [id, openedAt, minutes(openedAt, 60 * 24)],
    );
  }
  return id;
}

/** Código de invitación vigente del grupo. */
export async function inviteCodeOf(harness: BillingHarness, groupId: string): Promise<string> {
  const result = await harness.pool.query<{ invite_code: string }>(
    'SELECT invite_code FROM groups WHERE id = $1',
    [groupId],
  );
  return (result.rows[0] as { invite_code: string }).invite_code;
}
