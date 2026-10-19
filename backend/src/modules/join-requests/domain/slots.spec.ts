import { availableSlots } from './slots.js';

describe('availableSlots', () => {
  it('RN-010-02: cupos totales − miembros − reservas', () => {
    expect(availableSlots({ totalSlots: 5, activeMembers: 3, reserved: 1 })).toBe(1);
    expect(availableSlots({ totalSlots: 5, activeMembers: 1, reserved: 0 })).toBe(4);
  });

  it('RN-010-02: un grupo lleno o sobrerreservado no tiene cupos (nunca negativo)', () => {
    expect(availableSlots({ totalSlots: 4, activeMembers: 3, reserved: 1 })).toBe(0);
    expect(availableSlots({ totalSlots: 4, activeMembers: 4, reserved: 2 })).toBe(0);
  });
});
