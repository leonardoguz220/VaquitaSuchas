import { disputeEligibility, type DisputeRequestInput } from './dispute-rules.js';

const finalAt = new Date('2026-10-10T12:00:00Z');
const day = 24 * 3600_000;

const base: DisputeRequestInput = {
  status: 'rechazada',
  paymentReported: true,
  finalReason: 'rechazo_titular',
  finalAt,
  rejectedAsFalse: false,
};

describe('disputeEligibility', () => {
  const now = new Date(finalAt.getTime() + day);

  it('CA-010-27: el solicitante reclama pago sin ingreso si fue rechazada tras informar el pago', () => {
    expect(disputeEligibility({ role: 'solicitante', request: base, now })).toEqual({
      ok: true,
      kind: 'pago_sin_ingreso',
      closesAt: new Date(finalAt.getTime() + 7 * day),
    });
  });

  it('CA-010-27: también si expiró por titular_sin_respuesta', () => {
    const request = { ...base, status: 'expirada' as const, finalReason: 'titular_sin_respuesta' };
    expect(disputeEligibility({ role: 'solicitante', request, now })).toMatchObject({ ok: true });
  });

  it('CA-010-28: expirada por otro motivo, cancelada o aceptada no habilita el reclamo del solicitante', () => {
    for (const request of [
      { ...base, status: 'expirada' as const, finalReason: 'plazo_pago' },
      { ...base, status: 'cancelada' as const },
      { ...base, status: 'aceptada' as const },
    ]) {
      expect(disputeEligibility({ role: 'solicitante', request, now })).toEqual({
        ok: false,
        reason: 'not_eligible',
      });
    }
  });

  it('CA-010-28: sin pago informado se rechaza', () => {
    expect(
      disputeEligibility({
        role: 'solicitante',
        request: { ...base, paymentReported: false },
        now,
      }),
    ).toEqual({
      ok: false,
      reason: 'no_payment_reported',
    });
  });

  it('CA-010-43: el titular reclama comprobante falso solo si rechazó marcándolo como falso', () => {
    expect(
      disputeEligibility({ role: 'titular', request: { ...base, rejectedAsFalse: true }, now }),
    ).toMatchObject({
      ok: true,
      kind: 'comprobante_falso',
    });
    expect(disputeEligibility({ role: 'titular', request: base, now })).toEqual({
      ok: false,
      reason: 'not_eligible',
    });
  });

  it('CA-010-28: pasados 7 días desde final_at se rechaza (el último instante aún vale)', () => {
    expect(
      disputeEligibility({
        role: 'solicitante',
        request: base,
        now: new Date(finalAt.getTime() + 7 * day),
      }),
    ).toMatchObject({ ok: true });
    expect(
      disputeEligibility({
        role: 'solicitante',
        request: base,
        now: new Date(finalAt.getTime() + 7 * day + 1),
      }),
    ).toEqual({ ok: false, reason: 'window_expired' });
  });

  it('CA-010-28: un reclamo ya abierto por la misma parte se rechaza', () => {
    expect(
      disputeEligibility({ role: 'solicitante', request: { ...base, ownDisputeOpen: true }, now }),
    ).toEqual({
      ok: false,
      reason: 'already_open',
    });
  });

  it('RF-010-21: una solicitud no final no admite reclamo', () => {
    expect(
      disputeEligibility({
        role: 'solicitante',
        request: { ...base, status: 'pago_informado', finalAt: null },
        now,
      }),
    ).toEqual({ ok: false, reason: 'not_final' });
  });
});
