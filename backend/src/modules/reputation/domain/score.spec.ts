import { describe, expect, it } from '@jest/globals';
import type { ChargeFact } from './facts.js';
import { computeReputation, exactStarsText, isConsidered } from './score.js';

const NOW = new Date('2026-10-16T15:00:00Z');

/** Cobro `pagado` puntual (subido antes del vencimiento) o tardío. */
function fact(over: Partial<ChargeFact> & { punctual?: boolean; month?: number } = {}): ChargeFact {
  const { punctual = true, month = 8, ...rest } = over;
  const dueAt = new Date(Date.UTC(2026, month - 1, 19, 4));
  return {
    chargeId: `c-${Math.random()}`,
    status: 'pagado',
    origin: 'ciclo',
    dueAt,
    firstSubmittedAt: new Date(dueAt.getTime() + (punctual ? -3_600_000 : 3_600_000)),
    lastUploadAt: null,
    paidAt: null,
    settlement: 'comprobante',
    invalidReceipt: false,
    groupFrozenByBan: false,
    excluded: false,
    ...rest,
  };
}

const many = (punctual: number, late: number): ChargeFact[] => [
  ...Array.from({ length: punctual }, () => fact()),
  ...Array.from({ length: late }, () => fact({ punctual: false })),
];

describe('computeReputation', () => {
  it('CA-007-01: 10 considerados y 9 puntuales son 4,5 estrellas y «Bueno»', () => {
    expect(computeReputation(many(9, 1), NOW)).toMatchObject({
      consideredCount: 10,
      punctualCount: 9,
      lateCount: 1,
      halfStars: 9,
      level: 'Bueno',
    });
  });

  it('CA-007-02: con 2 cobros considerados es «Nuevo» y sin estrellas', () => {
    expect(computeReputation(many(2, 0), NOW)).toMatchObject({ level: 'Nuevo', halfStars: null });
  });

  it('CA-007-16: sin cobros no falla y devuelve «Nuevo»', () => {
    expect(computeReputation([], NOW)).toMatchObject({
      consideredCount: 0,
      level: 'Nuevo',
      halfStars: null,
      exactStars: null,
    });
  });

  it('CA-007-18: 19/20, 15/20 y 11/20 son 5 Excelente, 4 Bueno y 3 Regular', () => {
    expect(computeReputation(many(19, 1), NOW)).toMatchObject({
      halfStars: 10,
      level: 'Excelente',
    });
    expect(computeReputation(many(15, 5), NOW)).toMatchObject({ halfStars: 8, level: 'Bueno' });
    expect(computeReputation(many(11, 9), NOW)).toMatchObject({ halfStars: 6, level: 'Regular' });
  });

  it('CA-007-19: 7 de 8 son 4,375 exactas y se muestran como 4,5', () => {
    expect(computeReputation(many(7, 1), NOW)).toMatchObject({
      exactStars: '4.3750',
      halfStars: 9,
    });
  });

  it('el nivel «En riesgo» llega hasta 2,5 estrellas', () => {
    expect(computeReputation(many(5, 5), NOW)).toMatchObject({ halfStars: 5, level: 'En riesgo' });
    expect(computeReputation(many(0, 3), NOW)).toMatchObject({ halfStars: 0, level: 'En riesgo' });
  });

  it('CA-007-06: un cobro cancelado no cuenta', () => {
    const facts = [...many(3, 0), fact({ status: 'cancelado', punctual: false })];
    expect(computeReputation(facts, NOW).consideredCount).toBe(3);
  });

  it('CA-007-07: un cobro atrasado aún sin pagar cuenta como no puntual', () => {
    const facts = [...many(3, 0), fact({ status: 'atrasado', firstSubmittedAt: null })];
    expect(computeReputation(facts, NOW)).toMatchObject({ consideredCount: 4, lateCount: 1 });
  });

  it('CA-007-22: el único cobro pagado es de ingreso: no cuenta y es «Nuevo»', () => {
    const entry = fact({ origin: 'ingreso', settlement: 'ingreso', firstSubmittedAt: null });
    expect(computeReputation([entry], NOW)).toMatchObject({ consideredCount: 0, level: 'Nuevo' });
  });

  it('calcula la racha por vencimiento', () => {
    const facts = [
      fact({ month: 3, punctual: false }),
      fact({ month: 4 }),
      fact({ month: 5 }),
      fact({ month: 6 }),
    ];
    expect(computeReputation(facts, NOW).currentStreak).toBe(3);
  });
});

describe('isConsidered', () => {
  it('RN-007-01: solo los últimos 12 meses', () => {
    expect(isConsidered(fact({ dueAt: new Date('2025-10-17T04:00:00Z') }), NOW)).toBe(true);
    expect(isConsidered(fact({ dueAt: new Date('2025-10-15T04:00:00Z') }), NOW)).toBe(false);
  });

  it('RF-007-14: un cobro excluido no cuenta', () => {
    expect(isConsidered(fact({ excluded: true }), NOW)).toBe(false);
  });

  it('un grupo congelado por baneo solo cuenta lo ya pagado', () => {
    expect(isConsidered(fact({ groupFrozenByBan: true }), NOW)).toBe(true);
    expect(isConsidered(fact({ groupFrozenByBan: true, status: 'atrasado' }), NOW)).toBe(false);
  });

  it('pendiente y en revisión no cuentan', () => {
    expect(isConsidered(fact({ status: 'pendiente' }), NOW)).toBe(false);
    expect(isConsidered(fact({ status: 'en_revision' }), NOW)).toBe(false);
  });
});

describe('exactStarsText', () => {
  it('formatea con 4 decimales sin float', () => {
    expect(exactStarsText(7, 8)).toBe('4.3750');
    expect(exactStarsText(1, 3)).toBe('1.6667');
    expect(exactStarsText(3, 3)).toBe('5.0000');
    expect(exactStarsText(0, 0)).toBeNull();
  });
});
