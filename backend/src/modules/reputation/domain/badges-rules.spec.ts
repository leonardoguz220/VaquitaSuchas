import { describe, expect, it } from '@jest/globals';
import { badgeProgress, badgesEarned } from './badges-rules.js';
import type { ChargeFact } from './facts.js';

const NOW = new Date('2026-10-16T15:00:00Z');

/** Cobro de ese mes (2026) pagado a tiempo o tarde. */
function fact(month: number, punctual = true): ChargeFact {
  const dueAt = new Date(Date.UTC(2026, month - 1, 19, 4));
  return {
    chargeId: `c-${month}`,
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
  };
}

describe('badgesEarned', () => {
  it('CA-007-08: tres pagos puntuales seguidos otorgan «Racha 3» y «Primer pago»', () => {
    expect(badgesEarned([fact(6), fact(7), fact(8)], new Set(), NOW)).toEqual([
      'primer_pago',
      'racha_3',
      'sin_atrasos_6m',
    ]);
  });

  it('CA-007-09: una insignia ya obtenida no se vuelve a otorgar ni se pierde con un atraso', () => {
    const facts = [fact(6), fact(7), fact(8), fact(9, false)];
    const existing = new Set(['primer_pago', 'racha_3']);

    expect(badgesEarned(facts, existing, NOW)).toEqual([]);
    expect(badgeProgress('racha_3', facts, NOW)).toBe(0); // la racha actual vuelve a 0
  });

  it('con 2 pagos puntuales todavía no hay «Racha 3» y el avance es 2 de 3', () => {
    expect(badgesEarned([fact(7), fact(8)], new Set(['primer_pago']), NOW)).toEqual([]);
    expect(badgeProgress('racha_3', [fact(7), fact(8)], NOW)).toBe(2);
  });

  it('«Sin atrasos 6 meses» no se otorga si hubo un tardío en el período', () => {
    const facts = [fact(6), fact(7, false), fact(8)];
    expect(badgesEarned(facts, new Set(['primer_pago']), NOW)).not.toContain('sin_atrasos_6m');
  });

  it('el avance se acota al objetivo', () => {
    const facts = Array.from({ length: 5 }, (_, i) => fact(i + 4));
    expect(badgeProgress('racha_3', facts, NOW)).toBe(3);
    expect(badgeProgress('racha_6', facts, NOW)).toBe(5);
  });
});
