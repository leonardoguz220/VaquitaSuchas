import {
  checkPaymentQr,
  MAX_PAYMENT_INFO_TEXT,
  MAX_PAYMENT_QR_BYTES,
  normalizePaymentText,
  paymentQrKey,
  paymentQrMime,
  planPaymentInfoChange,
  type StoredPaymentInfo,
} from './payment-qr.js';

const withSignature = (signature: number[], size: number): Uint8Array => {
  const bytes = new Uint8Array(size).fill(0x61);
  bytes.set(signature);
  return bytes;
};
const PNG = [0x89, 0x50, 0x4e, 0x47];
const JPEG = [0xff, 0xd8, 0xff];

describe('checkPaymentQr (RF-001-20)', () => {
  it('acepta JPG y PNG por su firma binaria', () => {
    expect(checkPaymentQr(withSignature(PNG, 100))).toEqual({ ok: true, type: 'png' });
    expect(checkPaymentQr(withSignature(JPEG, 100))).toEqual({ ok: true, type: 'jpeg' });
  });

  it('acepta exactamente 2 MB y rechaza un byte más', () => {
    expect(checkPaymentQr(withSignature(PNG, MAX_PAYMENT_QR_BYTES)).ok).toBe(true);
    expect(checkPaymentQr(withSignature(PNG, MAX_PAYMENT_QR_BYTES + 1))).toEqual({
      ok: false,
      reason: 'too_large',
    });
  });

  it('rechaza vacío, PDF y ejecutables aunque se llamen .png', () => {
    expect(checkPaymentQr(new Uint8Array(0))).toEqual({ ok: false, reason: 'empty' });
    expect(checkPaymentQr(withSignature([0x25, 0x50, 0x44, 0x46, 0x2d], 50))).toEqual({
      ok: false,
      reason: 'unsupported_type',
    });
    expect(checkPaymentQr(withSignature([0x4d, 0x5a], 50))).toEqual({
      ok: false,
      reason: 'unsupported_type',
    });
  });
});

describe('paymentQrKey y paymentQrMime', () => {
  it('genera groups/<id>/qr/<uuid>.<ext> desde el tipo real', () => {
    expect(paymentQrKey({ groupId: 'g1', fileId: 'f1', type: 'png' })).toBe('groups/g1/qr/f1.png');
    expect(paymentQrKey({ groupId: 'g1', fileId: 'f1', type: 'jpeg' })).toBe('groups/g1/qr/f1.jpg');
    expect(paymentQrMime('png')).toBe('image/png');
    expect(paymentQrMime('jpeg')).toBe('image/jpeg');
  });
});

describe('normalizePaymentText (RF-001-20)', () => {
  it('recorta, trata vacío como null y acepta 500 caracteres', () => {
    expect(normalizePaymentText('  Cuenta 1  ')).toEqual({ ok: true, value: 'Cuenta 1' });
    expect(normalizePaymentText('   ')).toEqual({ ok: true, value: null });
    expect(normalizePaymentText('a'.repeat(MAX_PAYMENT_INFO_TEXT)).ok).toBe(true);
  });

  it('rechaza más de 500 caracteres', () => {
    expect(normalizePaymentText('a'.repeat(MAX_PAYMENT_INFO_TEXT + 1))).toEqual({
      ok: false,
      reason: 'too_long',
    });
  });
});

describe('planPaymentInfoChange', () => {
  const current: StoredPaymentInfo = {
    text: 'viejo',
    qrKey: 'groups/g/qr/a.png',
    qrMime: 'image/png',
  };

  it('sin cambios conserva texto y QR', () => {
    expect(planPaymentInfoChange(current, {})).toEqual({ next: current, obsoleteQrKey: null });
  });

  it('un QR nuevo reemplaza al anterior, que queda como obsoleto', () => {
    const plan = planPaymentInfoChange(current, {
      text: 'nuevo',
      newQr: { key: 'groups/g/qr/b.jpg', mime: 'image/jpeg' },
    });
    expect(plan.next).toEqual({ text: 'nuevo', qrKey: 'groups/g/qr/b.jpg', qrMime: 'image/jpeg' });
    expect(plan.obsoleteQrKey).toBe('groups/g/qr/a.png');
  });

  it('removeQr borra el QR y conserva el texto', () => {
    const plan = planPaymentInfoChange(current, { removeQr: true });
    expect(plan.next).toEqual({ text: 'viejo', qrKey: null, qrMime: null });
    expect(plan.obsoleteQrKey).toBe('groups/g/qr/a.png');
  });

  it('un texto null limpia el texto sin tocar el QR', () => {
    const plan = planPaymentInfoChange(current, { text: null });
    expect(plan.next).toEqual({ ...current, text: null });
    expect(plan.obsoleteQrKey).toBeNull();
  });

  it('sin QR anterior no hay nada que borrar', () => {
    const plan = planPaymentInfoChange(
      { text: null, qrKey: null, qrMime: null },
      { newQr: { key: 'k', mime: 'image/png' } },
    );
    expect(plan.obsoleteQrKey).toBeNull();
  });
});
