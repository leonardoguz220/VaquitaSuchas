import { canOpenRequest, type CanOpenRequestInput } from './can-open-request.js';

const ok: CanOpenRequestInput = {
  accountRestricted: false,
  group: { status: 'activo', frozen: false, acceptingMembers: true },
  windowOpen: true,
  availableSlots: 1,
  isMember: false,
  openChargesInGroup: 0,
  activeRequestsInGroup: 0,
  activeRequestsTotal: 4,
};

describe('canOpenRequest', () => {
  it('RF-010-01: con todo en regla no hay reglas incumplidas', () => {
    expect(canOpenRequest(ok)).toEqual([]);
  });

  it('CA-010-37: ventana cerrada', () => {
    expect(canOpenRequest({ ...ok, windowOpen: false })).toEqual(['window_closed']);
  });

  it('RF-010-01: grupo cerrado, congelado o sin recibir miembros', () => {
    expect(canOpenRequest({ ...ok, group: { ...ok.group, status: 'cerrado' } })).toEqual([
      'group_not_active',
    ]);
    expect(canOpenRequest({ ...ok, group: { ...ok.group, frozen: true } })).toEqual([
      'group_frozen',
    ]);
    expect(canOpenRequest({ ...ok, group: { ...ok.group, acceptingMembers: false } })).toEqual([
      'group_not_accepting',
    ]);
  });

  it('RF-010-01: sin cupo y ya miembro', () => {
    expect(canOpenRequest({ ...ok, availableSlots: 0 })).toEqual(['no_slots']);
    expect(canOpenRequest({ ...ok, isMember: true })).toEqual(['already_member']);
  });

  it('CA-010-45: un cobro abierto en el grupo impide abrir la solicitud', () => {
    expect(canOpenRequest({ ...ok, openChargesInGroup: 1 })).toEqual(['open_charges']);
  });

  it('RF-010-02: una sola activa por grupo y hasta 5 en total', () => {
    expect(canOpenRequest({ ...ok, activeRequestsInGroup: 1 })).toEqual([
      'active_request_in_group',
    ]);
    expect(canOpenRequest({ ...ok, activeRequestsTotal: 5 })).toEqual(['too_many_active_requests']);
    expect(canOpenRequest({ ...ok, activeRequestsTotal: 4 })).toEqual([]);
  });

  it('CA-010-34: una cuenta suspendida o baneada no puede abrir', () => {
    expect(canOpenRequest({ ...ok, accountRestricted: true })).toEqual(['account_restricted']);
  });

  it('RF-010-01: acumula varias reglas', () => {
    expect(canOpenRequest({ ...ok, windowOpen: false, availableSlots: 0 })).toEqual([
      'window_closed',
      'no_slots',
    ]);
  });
});
