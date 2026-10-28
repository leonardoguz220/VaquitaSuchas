import { quoteShortfall } from './shortfall-quote.js';

const member = (userId: string, paidCents: number) => ({
  userId,
  fullName: `Persona ${userId}`,
  paidCents,
});

describe('quoteShortfall', () => {
  it('CA-011-01: Bs 100,00 entre 3 miembros que se quedan; A y B pagaron 25,00 y deben 8,33', () => {
    const quote = quoteShortfall({
      totalBsCents: 10000,
      memberCountAfter: 3,
      paid: [member('a', 2500), member('b', 2500)],
    });

    expect(quote.baseShareCents).toBe(3333);
    expect(quote.ownerShareCents).toBe(3334);
    expect(quote.rows.map((r) => r.extraDueCents)).toEqual([833, 833]);
    expect(quote.shortfallCents).toBe(1666);
  });

  it('RN-011-02: con todos cubriendo, afectados + parte del titular suman el total', () => {
    const paid = [member('a', 2500), member('b', 2500)];
    const quote = quoteShortfall({ totalBsCents: 10000, memberCountAfter: 3, paid });

    const covered = quote.rows.reduce((sum, r) => sum + r.paidCents + r.extraDueCents, 0);

    expect(covered + quote.ownerShareCents).toBe(10000);
  });

  it('RF-011-02: quien ya pagó la cuota nueva o más no es afectado', () => {
    const quote = quoteShortfall({
      totalBsCents: 10000,
      memberCountAfter: 3,
      paid: [member('a', 3333), member('b', 5000), member('c', 2500)],
    });

    expect(quote.rows.map((r) => r.userId)).toEqual(['c']);
  });

  it('RF-011-03: sin diferencia no hay afectados ni faltante', () => {
    const quote = quoteShortfall({
      totalBsCents: 10000,
      memberCountAfter: 4,
      paid: [member('a', 2500), member('b', 2500), member('c', 2500)],
    });

    expect(quote).toEqual({
      baseShareCents: 2500,
      ownerShareCents: 2500,
      shortfallCents: 0,
      rows: [],
    });
  });

  it('solo queda el titular: no hay a quién repartir', () => {
    const quote = quoteShortfall({
      totalBsCents: 10000,
      memberCountAfter: 1,
      paid: [member('a', 1)],
    });

    expect(quote.rows).toEqual([]);
    expect(quote.shortfallCents).toBe(0);
    expect(quote.ownerShareCents).toBe(10000);
  });

  it('RN-001-02: para muchos totales y tamaños el resto del titular está en 0..n−1', () => {
    for (let n = 2; n <= 20; n += 1) {
      for (const total of [100, 999, 1000, 12345, 500000]) {
        const quote = quoteShortfall({ totalBsCents: total, memberCountAfter: n, paid: [] });
        const remainder = quote.ownerShareCents - quote.baseShareCents;
        expect(remainder).toBeGreaterThanOrEqual(0);
        expect(remainder).toBeLessThan(n);
        expect(quote.baseShareCents * n + remainder).toBe(total);
      }
    }
  });

  it('rechaza montos con decimales o negativos', () => {
    expect(() => quoteShortfall({ totalBsCents: 10.5, memberCountAfter: 3, paid: [] })).toThrow(
      RangeError,
    );
    expect(() =>
      quoteShortfall({ totalBsCents: 1000, memberCountAfter: 3, paid: [member('a', -1)] }),
    ).toThrow(RangeError);
    expect(() => quoteShortfall({ totalBsCents: 1000, memberCountAfter: 0, paid: [] })).toThrow(
      RangeError,
    );
  });
});
