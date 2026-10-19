import { generateToken, hashToken, tokenHashesEqual, tokenIsUsable } from './tokens.js';

const now = new Date('2026-10-19T12:00:00Z');

describe('tokenIsUsable', () => {
  it('CA-003-11: un token dentro de su vigencia es usable', () => {
    expect(tokenIsUsable({ expiresAt: new Date(now.getTime() + 1000), usedAt: null }, now)).toBe(
      'usable',
    );
  });

  it('CA-003-11: un token de recuperación vencido (más de 30 min) se rechaza', () => {
    expect(tokenIsUsable({ expiresAt: new Date(now.getTime() - 1), usedAt: null }, now)).toBe(
      'expired',
    );
  });

  it('CA-003-11: un token ya usado se rechaza', () => {
    expect(tokenIsUsable({ expiresAt: new Date(now.getTime() + 1000), usedAt: now }, now)).toBe(
      'used',
    );
  });
});

describe('generateToken / hashToken / tokenHashesEqual', () => {
  it('RF-003-18: genera 32 bytes en base64url, distintos cada vez', () => {
    const a = generateToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(generateToken()).not.toBe(a);
  });

  it('RF-003-18: el hash es SHA-256 hex y determinista', () => {
    expect(hashToken('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('RF-003-18: compara hashes en tiempo constante', () => {
    expect(tokenHashesEqual(hashToken('x'), hashToken('x'))).toBe(true);
    expect(tokenHashesEqual(hashToken('x'), hashToken('y'))).toBe(false);
    expect(tokenHashesEqual('abc', 'abcd')).toBe(false);
  });
});
