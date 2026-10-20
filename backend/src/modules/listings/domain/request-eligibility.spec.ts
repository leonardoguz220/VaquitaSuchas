import { requestEligibility } from './request-eligibility.js';

const base = {
  accountRestricted: false,
  group: { status: 'activo', frozen: false, acceptingMembers: true },
  windowOpen: true,
  availableSlots: 1,
  isMember: false,
  openChargesInGroup: 0,
  activeRequestsInGroup: 0,
  activeRequestsTotal: 0,
} as const;

describe('requestEligibility', () => {
  it('RF-008-03: sin impedimentos puede solicitar', () => {
    expect(requestEligibility(base)).toEqual({ canRequest: true, cannotRequestReason: null });
  });

  it('CA-008-23: ventana cerrada → VENTANA_CERRADA', () => {
    expect(requestEligibility({ ...base, windowOpen: false })).toEqual({
      canRequest: false,
      cannotRequestReason: 'VENTANA_CERRADA',
    });
  });

  it('RF-008-03: cada regla tiene su motivo', () => {
    expect(requestEligibility({ ...base, accountRestricted: true }).cannotRequestReason).toBe(
      'CUENTA_RESTRINGIDA',
    );
    expect(requestEligibility({ ...base, availableSlots: 0 }).cannotRequestReason).toBe(
      'SIN_CUPOS',
    );
    expect(requestEligibility({ ...base, openChargesInGroup: 1 }).cannotRequestReason).toBe(
      'COBROS_ABIERTOS',
    );
    expect(requestEligibility({ ...base, activeRequestsInGroup: 1 }).cannotRequestReason).toBe(
      'SOLICITUD_ACTIVA',
    );
    expect(requestEligibility({ ...base, activeRequestsTotal: 5 }).cannotRequestReason).toBe(
      'DEMASIADAS_SOLICITUDES',
    );
  });

  it('RF-008-03: con varias reglas incumplidas informa la de mayor prioridad', () => {
    expect(
      requestEligibility({ ...base, windowOpen: false, availableSlots: 0 }).cannotRequestReason,
    ).toBe('VENTANA_CERRADA');
  });
});
