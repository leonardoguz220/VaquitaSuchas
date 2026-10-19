import { checkQrFile, MAX_PAYMENT_TEXT, resolvePaymentInfo } from './payment-info.js';

const png = (size: number): Uint8Array => {
  const bytes = new Uint8Array(size).fill(0x61);
  bytes.set([0x89, 0x50, 0x4e, 0x47]);
  return bytes;
};

describe('resolvePaymentInfo', () => {
  const group = { text: 'Cuenta del grupo', hasQr: true };

  it('RF-010-11: sin texto ni QR propios se usan los datos de pago del grupo', () => {
    expect(resolvePaymentInfo({ text: null, hasQr: false }, group)).toEqual({
      text: 'Cuenta del grupo',
      qr: 'group',
    });
    expect(resolvePaymentInfo({ text: '   ', hasQr: false }, group)).toEqual({
      text: 'Cuenta del grupo',
      qr: 'group',
    });
  });

  it('RF-010-11: lo que el titular envía en ese momento reemplaza a lo del grupo', () => {
    expect(resolvePaymentInfo({ text: ' Otra cuenta ', hasQr: false }, group)).toEqual({
      text: 'Otra cuenta',
      qr: null,
    });
    expect(resolvePaymentInfo({ text: null, hasQr: true }, group)).toEqual({
      text: null,
      qr: 'upload',
    });
  });

  it('PAYMENT_INFO_MISSING: sin nada propio y sin datos en el grupo devuelve null', () => {
    expect(
      resolvePaymentInfo({ text: null, hasQr: false }, { text: null, hasQr: false }),
    ).toBeNull();
  });

  it('RF-010-11: el texto tiene un máximo de 500 caracteres', () => {
    expect(MAX_PAYMENT_TEXT).toBe(500);
  });
});

describe('checkQrFile', () => {
  it('RF-010-11: acepta PNG hasta 2 MB', () => {
    expect(checkQrFile(png(2 * 1024 * 1024))).toEqual({ ok: true, type: 'png' });
  });

  it('RF-010-11: rechaza más de 2 MB, vacíos y PDF (solo JPG o PNG)', () => {
    expect(checkQrFile(png(2 * 1024 * 1024 + 1))).toEqual({ ok: false, reason: 'too_large' });
    expect(checkQrFile(new Uint8Array(0))).toEqual({ ok: false, reason: 'empty' });
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 1, 2]);
    expect(checkQrFile(pdf)).toEqual({ ok: false, reason: 'unsupported_type' });
  });
});
