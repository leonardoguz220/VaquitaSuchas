import { jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import type { Queryable } from '../../../shared/db/db.service.js';
import { BannedIdentitiesRepository } from '../repositories/banned-identities.repository.js';
import { UsersRepository } from '../repositories/users.repository.js';
import {
  decryptCi,
  encryptCi,
  fingerprint,
  IdentityService,
  parseKey,
} from './identity.service.js';

const HEX = 'ab'.repeat(32);
const key = parseKey(HEX);
const keys = new Map([[1, key]]);

describe('cifrado de la CI', () => {
  it('RF-003-22: cifra y descifra de ida y vuelta, con prefijo de versión', () => {
    const data = encryptCi('1234567', key);
    expect(data[0]).toBe(1);
    expect(data.includes(Buffer.from('1234567'))).toBe(false);
    expect(decryptCi(data, keys)).toBe('1234567');
  });

  it('RF-003-22: el mismo texto produce cifrados distintos (IV aleatorio)', () => {
    expect(encryptCi('1234567', key).equals(encryptCi('1234567', key))).toBe(false);
  });

  it('RF-003-22: una versión de clave desconocida falla', () => {
    expect(() => decryptCi(encryptCi('1234567', key, 2), keys)).toThrow();
  });

  it('RF-003-22: una etiqueta o texto alterados fallan', () => {
    const data = encryptCi('1234567', key);
    data[data.length - 1] ^= 1;
    expect(() => decryptCi(data, keys)).toThrow();
    const tag = encryptCi('1234567', key);
    tag[14] ^= 1;
    expect(() => decryptCi(tag, keys)).toThrow();
  });

  it('RF-003-22: acepta la clave en base64', () => {
    expect(parseKey(Buffer.alloc(32, 7).toString('base64')).length).toBe(32);
  });
});

describe('fingerprint', () => {
  it('CA-003-24: es un HMAC hex determinista que depende del tipo y de la clave', () => {
    const a = fingerprint('ci', '1234567', 'k1');
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(fingerprint('ci', '1234567', 'k1')).toBe(a);
    expect(fingerprint('phone', '1234567', 'k1')).not.toBe(a);
    expect(fingerprint('ci', '1234567', 'k2')).not.toBe(a);
    expect(a).not.toContain('1234567');
  });
});

type QueryFn = (text: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number }>;

function setup(identity: unknown = null) {
  const config = { getOrThrow: (k: string) => (k === 'CI_ENCRYPTION_KEY' ? HEX : 'fp-key') };
  const calls: { text: string; params?: unknown[] }[] = [];
  const query = jest.fn<QueryFn>((text, params) => {
    calls.push({ text, params });
    return Promise.resolve({ rows: identity ? [identity] : [], rowCount: identity ? 1 : 0 });
  });
  const q = { query } as unknown as Queryable;
  const service = new IdentityService(
    config as unknown as ConfigService,
    new UsersRepository(),
    new BannedIdentitiesRepository(),
  );
  return { service, q, calls };
}

describe('IdentityService', () => {
  it('CA-003-24: blockIdentities guarda solo huellas de correo, CI, celular y Telegram', async () => {
    const { service, q, calls } = setup({
      email_fingerprint: 'fe',
      ci_fingerprint: 'fc',
      phone_e164: '+59171234567',
      telegram_user_id: '99',
    });
    await service.blockIdentities(q, 'u-1', 'ban-1');
    const inserts = calls.filter((c) => c.text.includes('INSERT INTO banned_identities'));
    expect(inserts.map((c) => c.params?.[0])).toEqual(['email', 'ci', 'phone', 'telegram']);
    expect(inserts.every((c) => c.params?.[2] === 'ban-1')).toBe(true);
    const flat = JSON.stringify(inserts.map((c) => c.params));
    expect(flat).not.toContain('71234567');
    expect(inserts[2].params?.[1]).toBe(service.fingerprint('phone', '+59171234567'));
  });

  it('RF-003-19: sin celular ni Telegram solo bloquea correo y CI', async () => {
    const { service, q, calls } = setup({
      email_fingerprint: 'fe',
      ci_fingerprint: 'fc',
      phone_e164: null,
      telegram_user_id: null,
    });
    await service.blockIdentities(q, 'u-1', 'ban-1');
    expect(calls.filter((c) => c.text.includes('INSERT')).length).toBe(2);
  });

  it('RF-003-19: releaseIdentities borra por ban_ref', async () => {
    const { service, q, calls } = setup();
    await service.releaseIdentities(q, 'ban-1');
    expect(calls[0].text).toContain('DELETE FROM banned_identities');
    expect(calls[0].params).toEqual(['ban-1']);
  });

  it('CA-003-35: isBlocked canoniza el correo de Gmail antes de comparar', async () => {
    const { service, q, calls } = setup({});
    expect(await service.isBlocked(q, { email: 'n.o.m.b.r.e+1@gmail.com' })).toBe(true);
    expect(calls[0].params).toEqual([['email'], [service.emailFingerprint('nombre@gmail.com')]]);
  });

  it('RF-003-19: isBlocked sin datos no consulta', async () => {
    const { service, q, calls } = setup();
    expect(await service.isBlocked(q, {})).toBe(false);
    expect(calls).toEqual([]);
  });
});
