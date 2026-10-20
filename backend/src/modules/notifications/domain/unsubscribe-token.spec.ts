import { randomBytes, randomUUID } from 'node:crypto';
import { signUnsubscribe, verifyUnsubscribe } from './unsubscribe-token.js';

describe('unsubscribe-token', () => {
  const secret = randomBytes(32);
  const payload = { userId: randomUUID(), category: 'recordatorios', channel: 'email' } as const;

  it('CA-005-13: el token firmado se verifica y devuelve usuario, categoría y canal', () => {
    const token = signUnsubscribe(secret, payload);
    expect(verifyUnsubscribe(secret, token)).toEqual(payload);
  });

  it('CA-005-13: es determinista (no vence) y no contiene datos personales', () => {
    const token = signUnsubscribe(secret, payload);
    expect(signUnsubscribe(secret, payload)).toBe(token);
    expect(token).toMatch(/^[0-9a-f-]{36}\.recordatorios\.email\.[A-Za-z0-9_-]+$/);
  });

  it('CA-005-13: un token alterado, de otra clave o mal formado se rechaza', () => {
    const token = signUnsubscribe(secret, payload);
    expect(verifyUnsubscribe(randomBytes(32), token)).toBeNull();
    expect(verifyUnsubscribe(secret, token.replace('recordatorios', 'titular'))).toBeNull();
    expect(verifyUnsubscribe(secret, token.replace('.email.', '.telegram.'))).toBeNull();
    expect(verifyUnsubscribe(secret, `${token}x`)).toBeNull();
    expect(verifyUnsubscribe(secret, 'basura')).toBeNull();
    expect(verifyUnsubscribe(secret, '')).toBeNull();
    expect(verifyUnsubscribe(secret, `${randomUUID()}.admin.email.firma`)).toBeNull();
  });
});
