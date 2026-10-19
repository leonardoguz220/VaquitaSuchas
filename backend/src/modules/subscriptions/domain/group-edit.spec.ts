import { applyGroupPatch, type GroupEditable } from './group-edit.js';

const usd: GroupEditable = {
  name: 'Grupo',
  priceCents: 1000,
  currency: 'USD',
  exchangeRate: '6.9600',
  billingDay: 15,
  totalSlots: 4,
  acceptingMembers: true,
};

describe('applyGroupPatch', () => {
  it('RF-001-14: sin cambios devuelve el mismo estado', () => {
    expect(applyGroupPatch(usd, {})).toEqual(usd);
  });

  it('RF-001-14: solo cambia los campos enviados', () => {
    expect(applyGroupPatch(usd, { name: 'Otro', totalSlots: 5 })).toEqual({
      ...usd,
      name: 'Otro',
      totalSlots: 5,
    });
  });

  it('RF-001-03: pasar a BS descarta el tipo de cambio anterior', () => {
    expect(applyGroupPatch(usd, { currency: 'BS' }).exchangeRate).toBeNull();
  });

  it('RF-001-03: pasar de BS a USD sin tipo de cambio lo deja vacío para exigirlo', () => {
    const bs: GroupEditable = { ...usd, currency: 'BS', exchangeRate: null };
    expect(applyGroupPatch(bs, { currency: 'USD' }).exchangeRate).toBeNull();
    expect(applyGroupPatch(bs, { currency: 'USD', exchangeRate: '7.00' }).exchangeRate).toBe(
      '7.00',
    );
  });
});
