import {
  buildLocalSignedPath,
  deriveSigningKey,
  LOCAL_FILES_PATH,
  verifyLocalSignature,
} from './local-signature.js';

const KEY = deriveSigningKey('secreto-de-prueba-de-al-menos-32-caracteres');
const NOW = new Date('2026-01-01T00:00:00.000Z');
const EXPIRES_AT = Math.floor(NOW.getTime() / 1000) + 300;

function partsOf(path: string): { key: string; expires: number; signature: string } {
  const url = new URL(path, 'http://localhost');
  return {
    key: decodeURIComponent(url.pathname.slice(LOCAL_FILES_PATH.length + 1)),
    expires: Number(url.searchParams.get('expires')),
    signature: url.searchParams.get('signature') ?? '',
  };
}

describe('URL firmada local', () => {
  it('RF-000-12: la ruta lleva la clave, el vencimiento y una firma que verifica', () => {
    const path = buildLocalSignedPath('receipts/a.png', EXPIRES_AT, KEY);

    expect(path.startsWith('/files/receipts/a.png?')).toBe(true);
    const { key, expires, signature } = partsOf(path);
    expect(expires).toBe(EXPIRES_AT);
    expect(verifyLocalSignature(key, expires, signature, KEY, NOW)).toBe(true);
  });

  it('RF-000-12: deja de valer en el instante del vencimiento', () => {
    const { key, expires, signature } = partsOf(buildLocalSignedPath('a.png', EXPIRES_AT, KEY));

    const justBefore = new Date(EXPIRES_AT * 1000 - 1);
    const atExpiry = new Date(EXPIRES_AT * 1000);
    expect(verifyLocalSignature(key, expires, signature, KEY, justBefore)).toBe(true);
    expect(verifyLocalSignature(key, expires, signature, KEY, atExpiry)).toBe(false);
  });

  it('RF-000-12: no vale si cambian la clave, el vencimiento o la firma', () => {
    const { key, expires, signature } = partsOf(buildLocalSignedPath('a.png', EXPIRES_AT, KEY));

    expect(verifyLocalSignature('b.png', expires, signature, KEY, NOW)).toBe(false);
    expect(verifyLocalSignature(key, expires + 1, signature, KEY, NOW)).toBe(false);
    const lastChar = signature.endsWith('0') ? '1' : '0';
    const tampered = signature.slice(0, -1) + lastChar;
    expect(verifyLocalSignature(key, expires, tampered, KEY, NOW)).toBe(false);
    expect(verifyLocalSignature(key, expires, 'no-es-hex', KEY, NOW)).toBe(false);
    expect(verifyLocalSignature(key, expires, '', KEY, NOW)).toBe(false);
  });

  it('RF-000-12: una firma hecha con otro secreto no vale', () => {
    const other = deriveSigningKey('otro-secreto-de-prueba-de-al-menos-32-caracteres');
    const { key, expires, signature } = partsOf(buildLocalSignedPath('a.png', EXPIRES_AT, other));

    expect(verifyLocalSignature(key, expires, signature, KEY, NOW)).toBe(false);
  });

  it('RF-000-12: la clave de firma no es el secreto tal cual', () => {
    expect(deriveSigningKey('secreto').equals(Buffer.from('secreto'))).toBe(false);
    expect(deriveSigningKey('secreto').equals(deriveSigningKey('secreto'))).toBe(true);
  });

  it('RF-000-12: un vencimiento no entero no vale', () => {
    const { key, signature } = partsOf(buildLocalSignedPath('a.png', EXPIRES_AT, KEY));

    expect(verifyLocalSignature(key, Number.NaN, signature, KEY, NOW)).toBe(false);
  });
});
