import { openRequestError } from './open-request-errors.js';

// Códigos y `details.rule` de contracts/api.md (POST /join-requests), CA-010-02, CA-010-03, CA-010-37.
describe('openRequestError (contracts/api.md)', () => {
  it.each([
    [['account_restricted'], 'ACCOUNT_RESTRICTED', 403],
    [['already_member'], 'ALREADY_MEMBER', 422],
    [['group_frozen'], 'GROUP_FROZEN', 422],
    [['group_not_accepting'], 'GROUP_NOT_ACCEPTING', 422],
    [['no_slots'], 'NO_SLOTS_AVAILABLE', 422],
    [['open_charges'], 'OPEN_CHARGES_IN_GROUP', 422],
    [['active_request_in_group'], 'ACTIVE_REQUEST_EXISTS', 422],
    [['too_many_active_requests'], 'TOO_MANY_ACTIVE_REQUESTS', 422],
  ] as const)('%j -> %s (%i)', (rules, code, status) => {
    const error = openRequestError(rules, null);
    expect(error.code).toBe(code);
    expect(error.httpStatus).toBe(status);
  });

  it('la ventana cerrada lleva la fecha de apertura (CA-010-37)', () => {
    const error = openRequestError(['window_closed'], new Date('2026-11-15T04:00:00.000Z'));
    expect(error.code).toBe('ENTRY_WINDOW_CLOSED');
    expect(error.details).toEqual({ rule: 'RF-001-22', opensAt: '2026-11-15T04:00:00.000Z' });
  });

  it('con varias reglas incumplidas informa la de mayor prioridad (miembro antes que sin cupo)', () => {
    expect(openRequestError(['no_slots', 'already_member'], null).code).toBe('ALREADY_MEMBER');
  });
});
