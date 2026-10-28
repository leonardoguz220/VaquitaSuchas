import { computePayDeadline, computeRefundDue, computeRoundDeadlines } from './deadlines.js';

const OPENED = new Date('2026-10-28T12:00:00Z');

describe('deadlines', () => {
  it('RF-011-04: responder en 48 h y pagar como máximo a las 96 h', () => {
    const { respondBy, payBy } = computeRoundDeadlines(OPENED);

    expect(respondBy.toISOString()).toBe('2026-10-30T12:00:00.000Z');
    expect(payBy.toISOString()).toBe('2026-11-01T12:00:00.000Z');
  });

  it('RF-011-04: al cubrir se tienen 48 h, sin pasar del tope de la ronda', () => {
    const { payBy } = computeRoundDeadlines(OPENED);

    expect(computePayDeadline(new Date('2026-10-28T20:00:00Z'), payBy).toISOString()).toBe(
      '2026-10-30T20:00:00.000Z',
    );
    expect(computePayDeadline(new Date('2026-10-30T11:00:00Z'), payBy).toISOString()).toBe(
      '2026-11-01T11:00:00.000Z',
    );
    expect(computePayDeadline(new Date('2026-10-31T12:00:00Z'), payBy)).toEqual(payBy);
  });

  it('RF-011-12: la devolución puede disputarse a los 5 días', () => {
    expect(computeRefundDue(OPENED).toISOString()).toBe('2026-11-02T12:00:00.000Z');
  });
});
