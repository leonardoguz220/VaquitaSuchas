import { describe, expect, it } from '@jest/globals';
import type { ChargeFact } from './facts.js';
import { isPunctual } from './punctuality.js';

// Vencimiento exclusivo: el día 18 de La Paz vale hasta las 23:59:59 (04:00 UTC del día 19).
const DUE = new Date('2026-10-19T04:00:00Z');

function fact(over: Partial<ChargeFact>): ChargeFact {
  return {
    chargeId: 'c1',
    status: 'pagado',
    origin: 'ciclo',
    dueAt: DUE,
    firstSubmittedAt: null,
    lastUploadAt: null,
    paidAt: null,
    settlement: 'comprobante',
    invalidReceipt: false,
    groupFrozenByBan: false,
    excluded: false,
    ...over,
  };
}

describe('isPunctual', () => {
  it('CA-007-03: subido el día 18 a las 23:30 (La Paz) es puntual', () => {
    expect(isPunctual(fact({ firstSubmittedAt: new Date('2026-10-19T03:30:00Z') }))).toBe(true);
  });

  it('CA-007-04: subido el día 19 a las 00:05 (La Paz) no es puntual', () => {
    expect(isPunctual(fact({ firstSubmittedAt: new Date('2026-10-19T04:05:00Z') }))).toBe(false);
  });

  it('CA-007-05: rechazado y vuelto a subir tarde cuenta con la primera subida', () => {
    expect(
      isPunctual(
        fact({
          firstSubmittedAt: new Date('2026-10-18T15:00:00Z'),
          lastUploadAt: new Date('2026-10-22T15:00:00Z'),
        }),
      ),
    ).toBe(true);
  });

  it('CA-007-25: con «comprobante inválido» cuenta la última subida', () => {
    expect(
      isPunctual(
        fact({
          invalidReceipt: true,
          firstSubmittedAt: new Date('2026-10-18T15:00:00Z'),
          lastUploadAt: new Date('2026-10-22T15:00:00Z'),
        }),
      ),
    ).toBe(false);
  });

  it('un pago manual se mide con la fecha de pago', () => {
    expect(
      isPunctual(fact({ settlement: 'manual', paidAt: new Date('2026-10-18T12:00:00Z') })),
    ).toBe(true);
    expect(
      isPunctual(fact({ settlement: 'manual', paidAt: new Date('2026-10-20T12:00:00Z') })),
    ).toBe(false);
  });

  it('RN-007-04 / CA-007-24: un cobro atrasado no es puntual', () => {
    expect(isPunctual(fact({ status: 'atrasado' }))).toBe(false);
    expect(
      isPunctual(fact({ status: 'atrasado', firstSubmittedAt: new Date('2026-10-18T12:00:00Z') })),
    ).toBe(false);
  });

  it('sin ninguna subida no es puntual', () => {
    expect(isPunctual(fact({}))).toBe(false);
  });
});
