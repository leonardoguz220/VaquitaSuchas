import {
  canLeave,
  canReceiveOwnership,
  validateGroupInput,
  type GroupInput,
} from './group-rules.js';

const base: GroupInput = { priceCents: 5000, currency: 'BS', totalSlots: 4, billingDay: 15 };

describe('validateGroupInput', () => {
  it('CA-001-03: un precio en BS válido no lleva tipo de cambio', () => {
    expect(validateGroupInput(base)).toEqual([]);
    expect(validateGroupInput({ ...base, exchangeRate: '6.96' })).toEqual([
      'exchange_rate_not_allowed',
    ]);
  });

  it('CA-001-02: un precio en USD sin tipo de cambio es inválido', () => {
    expect(validateGroupInput({ ...base, currency: 'USD', priceCents: 1000 })).toEqual([
      'exchange_rate_required',
    ]);
    expect(
      validateGroupInput({ ...base, currency: 'USD', priceCents: 1000, exchangeRate: '0' }),
    ).toEqual(['exchange_rate_required']);
    expect(
      validateGroupInput({ ...base, currency: 'USD', priceCents: 1000, exchangeRate: '6.96' }),
    ).toEqual([]);
  });

  it('RN-001-09: el total en Bs está entre 100 y 500000 centavos', () => {
    expect(validateGroupInput({ ...base, priceCents: 99 })).toEqual(['price_range']);
    expect(validateGroupInput({ ...base, priceCents: 100 })).toEqual([]);
    expect(validateGroupInput({ ...base, priceCents: 500000 })).toEqual([]);
    expect(validateGroupInput({ ...base, priceCents: 500001 })).toEqual(['price_range']);
  });

  it('RN-001-09: el límite aplica al equivalente en Bs de un precio en USD', () => {
    const usd = { ...base, currency: 'USD' as const, exchangeRate: '6.96' };
    expect(validateGroupInput({ ...usd, priceCents: 14 })).toEqual(['price_range']); // Bs 0,97
    expect(validateGroupInput({ ...usd, priceCents: 15 })).toEqual([]); // Bs 1,04
    expect(validateGroupInput({ ...usd, priceCents: 71840 })).toEqual(['price_range']); // > Bs 5.000
  });

  it('RN-001-09: cupos entre 2 y 20 y día de cobro entre 1 y 31', () => {
    expect(validateGroupInput({ ...base, totalSlots: 1 })).toEqual(['slots_range']);
    expect(validateGroupInput({ ...base, totalSlots: 21 })).toEqual(['slots_range']);
    expect(validateGroupInput({ ...base, totalSlots: 20 })).toEqual([]);
    expect(validateGroupInput({ ...base, billingDay: 0 })).toEqual(['billing_day_range']);
    expect(validateGroupInput({ ...base, billingDay: 32 })).toEqual(['billing_day_range']);
    expect(validateGroupInput({ ...base, billingDay: 31 })).toEqual([]);
  });

  it('RN-001-13: los cupos no superan el máximo del plan', () => {
    expect(validateGroupInput({ ...base, totalSlots: 5 }, { maxSlots: 4 })).toEqual([
      'slots_exceed_plan',
    ]);
    expect(validateGroupInput({ ...base, totalSlots: 4 }, { maxSlots: 4 })).toEqual([]);
  });
});

describe('canLeave', () => {
  it('CA-001-15 / RN-001-08: el titular no puede abandonar', () => {
    expect(canLeave('titular', 0)).toBe('owner_must_transfer_or_close');
  });

  it('RF-001-16: un miembro con cobros abiertos no puede abandonar', () => {
    expect(canLeave('miembro', 1)).toBe('open_charges');
    expect(canLeave('miembro', 0)).toBeNull();
  });
});

describe('canReceiveOwnership', () => {
  it('RF-001-17: exige miembro activo y habilitado', () => {
    expect(
      canReceiveOwnership({ isActiveMember: true, isHostEligible: true, activeOwnedGroups: 0 }),
    ).toEqual([]);
    expect(
      canReceiveOwnership({ isActiveMember: false, isHostEligible: false, activeOwnedGroups: 0 }),
    ).toEqual(['not_active_member', 'not_host_eligible']);
  });

  it('RN-001-14: no puede tener ya 5 grupos activos como titular', () => {
    expect(
      canReceiveOwnership({ isActiveMember: true, isHostEligible: true, activeOwnedGroups: 4 }),
    ).toEqual([]);
    expect(
      canReceiveOwnership({ isActiveMember: true, isHostEligible: true, activeOwnedGroups: 5 }),
    ).toEqual(['too_many_active_groups']);
  });
});
