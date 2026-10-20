import { normalizePlainText } from './plain-text.js';

describe('normalizePlainText', () => {
  it('RN-008-07: recorta y normaliza saltos de línea', () => {
    expect(normalizePlainText('  hola\r\nmundo\r otro  ', 300)).toEqual({
      ok: true,
      value: 'hola\nmundo\n otro',
    });
  });

  it('CA-008-19: <script> y & quedan intactos (se muestran como texto plano)', () => {
    expect(normalizePlainText('<script>alert(1)</script> & más', 300)).toEqual({
      ok: true,
      value: '<script>alert(1)</script> & más',
    });
  });

  it('RN-008-07: rechaza caracteres de control', () => {
    expect(normalizePlainText('a\u0000b', 300)).toEqual({ ok: false, reason: 'CONTROL_CHARS' });
    expect(normalizePlainText('a\tb', 300)).toEqual({ ok: false, reason: 'CONTROL_CHARS' });
  });

  it('RN-008-07: respeta el máximo (300 sí, 301 no) y cuenta caracteres Unicode', () => {
    expect(normalizePlainText('a'.repeat(300), 300).ok).toBe(true);
    expect(normalizePlainText('a'.repeat(301), 300)).toEqual({ ok: false, reason: 'TOO_LONG' });
    expect(normalizePlainText('😀'.repeat(300), 300).ok).toBe(true);
  });

  it('RN-008-07: vacío tras recortar → null', () => {
    expect(normalizePlainText('   \n ', 300)).toEqual({ ok: true, value: null });
  });
});
