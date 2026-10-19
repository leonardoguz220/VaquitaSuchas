import { oneChargePerMember, ownerTotals } from './period-totals.js';

describe('ownerTotals (CA-002-20)', () => {
  it('CA-002-20: 2 pagados, 1 en revisión y 1 atrasado suman esperado = cobrado + pendiente + atrasado', () => {
    const totals = ownerTotals([
      { status: 'pagado', amountCents: 3333 },
      { status: 'pagado', amountCents: 3333 },
      { status: 'en_revision', amountCents: 3333 },
      { status: 'atrasado', amountCents: 3333 },
    ]);
    expect(totals).toEqual({
      expectedCents: 13332,
      collectedCents: 6666,
      pendingCents: 3333,
      overdueCents: 3333,
    });
    expect(totals.expectedCents).toBe(
      totals.collectedCents + totals.pendingCents + totals.overdueCents,
    );
  });

  it('CA-002-20: los cancelados no cuentan y pendiente suma a pendiente', () => {
    expect(
      ownerTotals([
        { status: 'cancelado', amountCents: 5000 },
        { status: 'pendiente', amountCents: 100 },
      ]),
    ).toEqual({ expectedCents: 100, collectedCents: 0, pendingCents: 100, overdueCents: 0 });
  });

  it('CA-002-20: sin cobros todo es cero', () => {
    expect(ownerTotals([])).toEqual({
      expectedCents: 0,
      collectedCents: 0,
      pendingCents: 0,
      overdueCents: 0,
    });
  });
});

describe('oneChargePerMember (RF-002-16)', () => {
  it('RF-002-16: prefiere el cobro vigente al cancelado de la misma persona', () => {
    const rows = oneChargePerMember([
      { userId: 'a', status: 'cancelado' as const, id: 1 },
      { userId: 'b', status: 'pendiente' as const, id: 2 },
      { userId: 'a', status: 'pagado' as const, id: 3 },
    ]);
    expect(rows.map((r) => r.id)).toEqual([3, 2]);
  });

  it('RF-002-16: si solo hay cancelados deja el último', () => {
    const rows = oneChargePerMember([
      { userId: 'a', status: 'cancelado' as const, id: 1 },
      { userId: 'a', status: 'cancelado' as const, id: 2 },
    ]);
    expect(rows.map((r) => r.id)).toEqual([2]);
  });
});
