import { ApiError, NETWORK_ERROR_CODE } from '@/services/http';
import { INVITE_PANEL_MESSAGES, invitePanelErrorMessage } from './group-invite-errors';

describe('invitePanelErrorMessage (T025)', () => {
  it('CA-001-11: un 403 dice que solo el titular puede hacerlo', () => {
    expect(invitePanelErrorMessage(new ApiError(403, 'FORBIDDEN', 'x'))).toBe(
      INVITE_PANEL_MESSAGES.forbidden,
    );
  });

  it('CA-001-16: grupo cerrado (GROUP_CLOSED o RN-001-07) y congelado (GROUP_FROZEN)', () => {
    expect(invitePanelErrorMessage(new ApiError(422, 'GROUP_CLOSED', 'x'))).toBe(
      INVITE_PANEL_MESSAGES.closed,
    );
    expect(
      invitePanelErrorMessage(new ApiError(422, 'BUSINESS_RULE', 'x', { rule: 'RN-001-07' })),
    ).toBe(INVITE_PANEL_MESSAGES.closed);
    expect(invitePanelErrorMessage(new ApiError(422, 'GROUP_FROZEN', 'x'))).toBe(
      INVITE_PANEL_MESSAGES.frozen,
    );
  });

  it('409 STALE_STATE, sin conexión e inesperado', () => {
    expect(invitePanelErrorMessage(new ApiError(409, 'STALE_STATE', 'x'))).toBe(
      INVITE_PANEL_MESSAGES.stale,
    );
    expect(invitePanelErrorMessage(new ApiError(0, NETWORK_ERROR_CODE, 'x'))).toBe(
      INVITE_PANEL_MESSAGES.connection,
    );
    expect(invitePanelErrorMessage(new ApiError(500, 'INTERNAL_ERROR', 'x'))).toBe(
      INVITE_PANEL_MESSAGES.unexpected,
    );
  });
});
