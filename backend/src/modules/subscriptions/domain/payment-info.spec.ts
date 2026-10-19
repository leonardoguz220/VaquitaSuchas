import { checkQrFile, normalizePaymentText, qrStorageKey } from './payment-info.js';

const withSignature = (signature: number[], size: number): Uint8Array => {
  const bytes = new Uint8Array(size).fill(0x61);
  bytes.set(signature);
  return bytes;
};

describe('checkQrFile', () => {
  it('CA-001-23: acepta JPG y PNG por firma binaria', () => {
    expect(checkQrFile(withSignature([0xff, 0xd8, 0xff], 100))).toMatchObject({
      ok: true,
      mime: 'image/jpeg',
    });
    expect(checkQrFile(withSignature([0x89, 0x50, 0x4e, 0x47], 100))).toMatchObject({
      ok: true,
      mime: 'image/png',
    });
  });

  it('CA-001-23: rechaza PDF, vacío y más de 2 MB', () => {
    expect(checkQrFile(withSignature([0x25, 0x50, 0x44, 0x46, 0x2d], 100))).toEqual({
      ok: false,
      reason: 'unsupported_type',
    });
    expect(checkQrFile(new Uint8Array(0))).toEqual({ ok: false, reason: 'empty' });
    expect(checkQrFile(withSignature([0xff, 0xd8, 0xff], 2 * 1024 * 1024 + 1))).toEqual({
      ok: false,
      reason: 'too_large',
    });
    expect(checkQrFile(withSignature([0xff, 0xd8, 0xff], 2 * 1024 * 1024)).ok).toBe(true);
  });
});

describe('normalizePaymentText y clave', () => {
  it('CA-001-23: recorta, acepta 500 y rechaza 501 caracteres', () => {
    expect(normalizePaymentText('  Banco X  ')).toEqual({ text: 'Banco X' });
    expect(normalizePaymentText('   ')).toEqual({ text: null });
    expect(normalizePaymentText('a'.repeat(500))).not.toBeNull();
    expect(normalizePaymentText('a'.repeat(501))).toBeNull();
  });

  it('CA-001-23: la clave sigue groups/<id>/qr/<uuid>.<ext>', () => {
    expect(qrStorageKey('g1', 'f1', 'png')).toBe('groups/g1/qr/f1.png');
  });
});
