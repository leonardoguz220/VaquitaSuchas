import { computeDeadlines } from './deadlines.js';

const now = new Date('2026-10-10T12:00:00Z');
const min = (n: number): Date => new Date(now.getTime() + n * 60_000);

describe('computeDeadlines', () => {
  it('RN-010-06: el plazo de pago es de 15 minutos', () => {
    expect(computeDeadlines('paymentData', now)).toEqual({ payDeadlineAt: min(15) });
  });

  it('CA-010-42: la prórroga suma 15 minutos al plazo vigente y solo una vez', () => {
    const current = min(15);
    expect(computeDeadlines('extension', now, { currentPayDeadlineAt: current })).toEqual({
      payDeadlineAt: min(30),
    });
    expect(
      computeDeadlines('extension', now, { currentPayDeadlineAt: current, alreadyExtended: true }),
    ).toEqual({});
  });

  it('RF-010-17: la decisión del titular es de 60 minutos con recordatorio a los 30', () => {
    expect(computeDeadlines('proof', now)).toEqual({
      decisionDeadlineAt: min(60),
      reminderAt: min(30),
    });
  });

  it('RN-010-06: la solicitud abierta dura 24 horas', () => {
    expect(computeDeadlines('open', now)).toEqual({ openDeadlineAt: min(24 * 60) });
  });

  it('RN-010-12: la solicitud abierta queda limitada por el fin de la ventana', () => {
    const end = min(90);
    expect(computeDeadlines('open', now, { windowEndExclusive: end })).toEqual({
      openDeadlineAt: end,
    });
    const farEnd = min(48 * 60);
    expect(computeDeadlines('open', now, { windowEndExclusive: farEnd })).toEqual({
      openDeadlineAt: min(24 * 60),
    });
  });

  it('RN-010-06: los plazos son valores de configuración', () => {
    expect(computeDeadlines('paymentData', now, { payMinutes: 10 })).toEqual({
      payDeadlineAt: min(10),
    });
    expect(computeDeadlines('proof', now, { decisionMinutes: 45, reminderMinutes: 20 })).toEqual({
      decisionDeadlineAt: min(45),
      reminderAt: min(20),
    });
  });
});
