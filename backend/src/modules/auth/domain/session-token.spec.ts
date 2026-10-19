import { buildSessionClaims, shouldRenewSession } from './session-token.js';

describe('session-token', () => {
  it('RF-003-07: el token dura 7 días desde su emisión', () => {
    expect(buildSessionClaims('u', 4, 1000)).toEqual({
      sub: 'u',
      sv: 4,
      iat: 1000,
      exp: 1000 + 604800,
    });
  });

  it('RF-003-07: renueva solo cuando quedan menos de 6 días', () => {
    const now = 1_000_000;
    expect(shouldRenewSession(now + 7 * 86400, now)).toBe(false);
    expect(shouldRenewSession(now + 6 * 86400, now)).toBe(false);
    expect(shouldRenewSession(now + 6 * 86400 - 1, now)).toBe(true);
  });
});
