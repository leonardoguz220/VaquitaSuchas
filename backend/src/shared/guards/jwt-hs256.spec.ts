import { createHmac } from 'node:crypto';
import { signHs256Jwt, verifyHs256Jwt } from './jwt-hs256.js';

const SECRET = 'secreto-de-prueba-con-al-menos-32-caracteres';
const OTHER_SECRET = 'otro-secreto-de-prueba-con-32-caracteres!!';
const USER_ID = '3f2b8c1e-6a4d-4f5b-9a7c-1d2e3f4a5b6c';
const NOW_MS = Date.parse('2026-10-18T12:00:00.000Z');
const NOW_S = Math.floor(NOW_MS / 1000);

const validClaims = (): Record<string, unknown> => ({
  sub: USER_ID,
  sv: 3,
  iat: NOW_S - 60,
  exp: NOW_S + 3600,
});

const b64url = (value: unknown): string =>
  Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');

/** Arma un token a mano para casos que `signHs256Jwt` nunca produciría (otro alg, sin firma). */
function craft(header: unknown, payload: unknown, secret: string | null): string {
  const signingInput = `${b64url(header)}.${b64url(payload)}`;
  const signature = secret
    ? createHmac('sha256', secret).update(signingInput).digest('base64url')
    : '';
  return `${signingInput}.${signature}`;
}

describe('verifyHs256Jwt (RF-000-11)', () => {
  it('RF-000-11: un token firmado con la clave y vigente devuelve sus claims', () => {
    const token = signHs256Jwt(validClaims(), SECRET);

    expect(verifyHs256Jwt(token, SECRET, NOW_MS)).toEqual({
      sub: USER_ID,
      sv: 3,
      iat: NOW_S - 60,
      exp: NOW_S + 3600,
    });
  });

  it('RF-000-11: un token firmado con otra clave se rechaza', () => {
    const token = signHs256Jwt(validClaims(), OTHER_SECRET);

    expect(verifyHs256Jwt(token, SECRET, NOW_MS)).toBeNull();
  });

  it('RF-000-11: un token vencido se rechaza y exp es exclusivo', () => {
    const atExp = signHs256Jwt({ ...validClaims(), exp: NOW_S }, SECRET);
    const lastSecond = signHs256Jwt({ ...validClaims(), exp: NOW_S + 1 }, SECRET);

    expect(verifyHs256Jwt(atExp, SECRET, NOW_MS)).toBeNull();
    expect(verifyHs256Jwt(lastSecond, SECRET, NOW_MS)).not.toBeNull();
  });

  it('RF-000-11: un payload alterado con la firma original se rechaza', () => {
    const [header, , signature] = signHs256Jwt(validClaims(), SECRET).split('.');
    const forged = `${header}.${b64url({ ...validClaims(), sub: 'ffffffff-ffff-4fff-8fff-ffffffffffff' })}.${signature}`;

    expect(verifyHs256Jwt(forged, SECRET, NOW_MS)).toBeNull();
  });

  it.each([
    ['none sin firma', { alg: 'none', typ: 'JWT' }, null],
    ['none con la firma HS256 copiada', { alg: 'none', typ: 'JWT' }, SECRET],
    ['HS512', { alg: 'HS512', typ: 'JWT' }, SECRET],
    ['RS256', { alg: 'RS256', typ: 'JWT' }, SECRET],
    ['alg en minúsculas', { alg: 'hs256', typ: 'JWT' }, SECRET],
    ['sin alg', { typ: 'JWT' }, SECRET],
  ])(
    'RF-000-11: el algoritmo %s se rechaza aunque la firma sea válida',
    (_name, header, secret) => {
      const token = craft(header, validClaims(), secret);

      expect(verifyHs256Jwt(token, SECRET, NOW_MS)).toBeNull();
    },
  );

  it.each([
    ['vacío', ''],
    ['sin puntos', 'abc'],
    ['dos partes', 'abc.def'],
    ['cuatro partes', 'a.b.c.d'],
    ['caracteres fuera de base64url', 'a b.c+d.e/f'],
    ['partes vacías', '..'],
  ])('RF-000-11: un token mal formado (%s) se rechaza sin lanzar', (_name, token) => {
    expect(verifyHs256Jwt(token, SECRET, NOW_MS)).toBeNull();
  });

  it('RF-000-11: un payload que no es un objeto JSON se rechaza', () => {
    for (const payload of ['no-es-json', '[1,2]', 'null', '"texto"']) {
      const token = craft({ alg: 'HS256', typ: 'JWT' }, payload, SECRET);
      expect(verifyHs256Jwt(token, SECRET, NOW_MS)).toBeNull();
    }
  });

  it('RF-000-11: una firma con relleno o caracteres extra (no canónica) se rechaza', () => {
    const token = signHs256Jwt(validClaims(), SECRET);

    expect(verifyHs256Jwt(`${token}=`, SECRET, NOW_MS)).toBeNull();
    expect(verifyHs256Jwt(`${token}A`, SECRET, NOW_MS)).toBeNull();
  });

  it.each([
    ['sub no es UUID', { sub: 'admin' }],
    ['sub ausente', { sub: undefined }],
    ['sv negativo', { sv: -1 }],
    ['sv decimal', { sv: 1.5 }],
    ['sv en texto', { sv: '3' }],
    ['sv ausente', { sv: undefined }],
    ['exp ausente', { exp: undefined }],
    ['exp en texto', { exp: String(NOW_S + 3600) }],
    ['exp decimal', { exp: NOW_S + 0.5 }],
    ['iat ausente', { iat: undefined }],
  ])('RF-000-11: claims inválidos (%s) se rechazan', (_name, override) => {
    const token = signHs256Jwt({ ...validClaims(), ...override }, SECRET);

    expect(verifyHs256Jwt(token, SECRET, NOW_MS)).toBeNull();
  });

  it('RF-000-11: los claims desconocidos no se copian al resultado', () => {
    const token = signHs256Jwt({ ...validClaims(), role: 'admin' }, SECRET);

    expect(verifyHs256Jwt(token, SECRET, NOW_MS)).not.toHaveProperty('role');
  });
});
