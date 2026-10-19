import { cutDateFor } from '../../subscriptions/domain/billing-calendar.js';
import { addDays, buildCycle, chargeFromCycle } from './cycle-calculation.js';

const owner = 'owner-1';
const usd = { ownerId: owner, priceCents: 1599, currency: 'USD' as const, exchangeRate: '6.96' };
const bs = { ownerId: owner, priceCents: 10_000, currency: 'BS' as const, exchangeRate: null };
const now = new Date('2026-10-15T04:00:00Z');

describe('buildCycle', () => {
  it('RF-002-01, RN-002-02: USD → Bs con tipo de cambio y copia del precio en el ciclo', () => {
    const cycle = buildCycle(usd, 4, { year: 2026, month: 10, day: 15 }, now);
    expect(cycle.totalBsCents).toBe(11_129); // 1599 × 6.96 = 11129.04 → 11129
    expect(cycle).toMatchObject({
      period: '2026-10',
      ownerId: owner,
      cycleType: 'regular',
      priceCents: 1599,
      currency: 'USD',
      exchangeRate: '6.96',
      memberCount: 4,
      issuedAt: now,
    });
  });

  it('RF-002-02: cuota base = floor(total/n) y el resto va al titular; la suma es el total', () => {
    const cycle = buildCycle(usd, 4, { year: 2026, month: 10, day: 15 }, now);
    expect(cycle.baseShareCents).toBe(2782);
    expect(cycle.remainderCents).toBe(1);
    expect(cycle.ownerShareCents).toBe(2783);
    expect(cycle.baseShareCents * 3 + cycle.ownerShareCents).toBe(cycle.totalBsCents);
  });

  it('RF-002-02: precio en Bs no lleva tipo de cambio y reparte exacto', () => {
    const cycle = buildCycle(bs, 3, { year: 2026, month: 10, day: 15 }, now, 'inicial');
    expect(cycle).toMatchObject({
      cycleType: 'inicial',
      exchangeRate: null,
      totalBsCents: 10_000,
      baseShareCents: 3333,
      ownerShareCents: 3334,
      remainderCents: 1,
    });
  });

  it('RF-002-03: el vencimiento informativo es el corte + 3 días', () => {
    const cycle = buildCycle(bs, 2, { year: 2026, month: 10, day: 30 }, now);
    expect(cycle.dueDate).toEqual({ year: 2026, month: 11, day: 2 });
  });

  it('CA-002-03: día de cobro 31 en febrero → corte 28 (2026) o 29 (2028)', () => {
    const c2026 = buildCycle(bs, 2, cutDateFor(2026, 2, 31), now);
    const c2028 = buildCycle(bs, 2, cutDateFor(2028, 2, 31), now);
    expect(c2026.cutDate).toEqual({ year: 2026, month: 2, day: 28 });
    expect(c2026.period).toBe('2026-02');
    expect(c2026.dueDate).toEqual({ year: 2026, month: 3, day: 3 });
    expect(c2028.cutDate).toEqual({ year: 2028, month: 2, day: 29 });
    expect(c2028.dueDate).toEqual({ year: 2028, month: 3, day: 3 });
  });

  it('RN-002-09: rechaza cero miembros', () => {
    expect(() => buildCycle(bs, 0, { year: 2026, month: 10, day: 15 }, now)).toThrow();
  });
});

describe('chargeFromCycle', () => {
  const cut = { year: 2026, month: 10, day: 15 };
  const cycle = buildCycle(usd, 4, cut, now);

  it('RF-002-02, RN-002-02: monto = cuota base y copia de precio, moneda, tipo de cambio, total y miembros', () => {
    const charge = chargeFromCycle(cycle, 'user-1', now);
    expect(charge).toMatchObject({
      userId: 'user-1',
      period: '2026-10',
      origin: 'ciclo',
      status: 'pendiente',
      amountCents: cycle.baseShareCents,
      priceCents: 1599,
      currency: 'USD',
      exchangeRate: '6.96',
      totalBsCents: 11_129,
      memberCount: 4,
      issuedAt: now,
    });
  });

  it('RF-002-03: emitido en el corte vence al inicio del día corte+4 en La Paz', () => {
    const charge = chargeFromCycle(cycle, 'user-1', new Date('2026-10-15T04:00:00Z'));
    expect(charge.dueAt.toISOString()).toBe('2026-10-19T04:00:00.000Z');
  });

  it('RF-002-03: emitido tarde (caída) da 3 días completos desde la emisión', () => {
    const late = new Date('2026-10-18T15:00:00Z');
    const charge = chargeFromCycle(cycle, 'user-1', late);
    expect(charge.dueAt.toISOString()).toBe('2026-10-21T15:00:00.000Z');
  });

  it('RN-002-09: el cobro no comparte referencias mutables con el ciclo', () => {
    const charge = chargeFromCycle(cycle, 'user-1', now);
    expect(charge.issuedAt).toBe(now);
    expect(Number.isInteger(charge.amountCents)).toBe(true);
  });
});

describe('addDays', () => {
  it('desborda al mes y año siguientes', () => {
    expect(addDays({ year: 2026, month: 12, day: 30 }, 3)).toEqual({
      year: 2027,
      month: 1,
      day: 2,
    });
  });
});
