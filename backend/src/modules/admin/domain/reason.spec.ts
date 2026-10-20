import { REASON_MAX, REASON_MIN, validateReason } from './reason.js';

describe('validateReason', () => {
  it('CA-009-10: un motivo ausente se rechaza', () => {
    expect(validateReason(undefined)).toEqual({ ok: false });
    expect(validateReason(null)).toEqual({ ok: false });
    expect(validateReason('')).toEqual({ ok: false });
    expect(validateReason(42)).toEqual({ ok: false });
  });

  it('CA-009-10: un motivo corto (menos de 10 caracteres tras recortar) se rechaza', () => {
    expect(validateReason('corto')).toEqual({ ok: false });
    expect(validateReason('   123456789   ')).toEqual({ ok: false });
    expect(validateReason(' '.repeat(20))).toEqual({ ok: false });
  });

  it('CA-009-23 (RN-009-07): el baneo sin motivo válido se rechaza; 10 y 300 caracteres pasan', () => {
    expect(validateReason('a'.repeat(REASON_MIN - 1)).ok).toBe(false);
    expect(validateReason('a'.repeat(REASON_MIN))).toEqual({ ok: true, value: 'a'.repeat(10) });
    expect(validateReason('a'.repeat(REASON_MAX))).toEqual({ ok: true, value: 'a'.repeat(300) });
    expect(validateReason('a'.repeat(REASON_MAX + 1)).ok).toBe(false);
  });

  it('RN-009-04: devuelve el texto recortado', () => {
    expect(validateReason('  Comprobante falso  ')).toEqual({
      ok: true,
      value: 'Comprobante falso',
    });
  });
});
