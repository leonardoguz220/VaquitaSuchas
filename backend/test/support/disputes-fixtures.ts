import { NOW, type BillingHarness, type TestGroup } from './billing-harness.js';
import { seedRequest } from './join-requests-fixtures.js';

export type DisputeScenario =
  'expirada_sin_respuesta' | 'rechazada' | 'rechazada_falso' | 'sin_pago';

/**
 * Lleva una solicitud a un estado final desde el que se puede (o no) reclamar. `finalAt` por
 * omisión es `NOW`; los reclamos por pago llegan siempre desde `pago_informado` con comprobante.
 */
export async function seedFinalRequest(
  harness: BillingHarness,
  group: Pick<TestGroup, 'id'>,
  applicantId: string,
  scenario: DisputeScenario,
  finalAt: string = NOW,
): Promise<string> {
  if (scenario === 'sin_pago') return seedRequest(harness, group, applicantId, 'rechazada');
  const id = await seedRequest(harness, group, applicantId, 'pago_informado');
  if (scenario === 'expirada_sin_respuesta') {
    await harness.pool.query(
      `UPDATE join_requests SET status = 'expirada', final_at = $2,
              final_reason = 'titular_sin_respuesta', version = version + 1 WHERE id = $1`,
      [id, finalAt],
    );
  } else {
    await harness.pool.query(
      `UPDATE join_requests SET status = 'rechazada', final_at = $2, final_reason = 'rechazo_titular',
              reject_reason = 'No recibí el pago', rejected_as_false = $3, version = version + 1
        WHERE id = $1`,
      [id, finalAt, scenario === 'rechazada_falso'],
    );
  }
  return id;
}
