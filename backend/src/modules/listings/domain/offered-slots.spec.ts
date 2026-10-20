import { clampOffered, offeredNow } from './offered-slots.js';

describe('offeredNow', () => {
  it('RN-008-04: sin reservas devuelve lo ofrecido si caben', () => {
    expect(offeredNow({ slotsOffered: 2, totalSlots: 5, members: 2, reserved: 0 })).toBe(2);
  });

  it('RN-008-04: las reservas reducen lo mostrado', () => {
    expect(offeredNow({ slotsOffered: 3, totalSlots: 5, members: 2, reserved: 2 })).toBe(1);
  });

  it('RN-008-04: nunca es negativo', () => {
    expect(offeredNow({ slotsOffered: 2, totalSlots: 5, members: 4, reserved: 3 })).toBe(0);
  });

  it('RN-008-04: ofrecidos menores que los libres se respetan', () => {
    expect(offeredNow({ slotsOffered: 1, totalSlots: 10, members: 2, reserved: 0 })).toBe(1);
  });
});

describe('clampOffered', () => {
  it('RN-008-04: si el grupo crece, baja a los libres', () => {
    expect(clampOffered({ slotsOffered: 3, totalSlots: 5, members: 4 })).toBe(1);
  });

  it('RN-008-04: grupo lleno → 0 (cerrar)', () => {
    expect(clampOffered({ slotsOffered: 2, totalSlots: 5, members: 5 })).toBe(0);
  });

  it('RN-008-04: si el grupo se vacía no sube lo ofrecido', () => {
    expect(clampOffered({ slotsOffered: 1, totalSlots: 5, members: 1 })).toBe(1);
  });
});
