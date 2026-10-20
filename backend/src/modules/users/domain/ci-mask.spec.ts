import { maskCi } from './ci-mask.js';

describe('maskCi', () => {
  it('CA-003-31: muestra solo los últimos 3 dígitos', () => {
    expect(maskCi('1234123')).toBe('*****123');
    expect(maskCi('1234567890')).toBe('*****890');
  });

  it('CA-009-36: la ficha de administración muestra la CI enmascarada, nunca completa', () => {
    const masked = maskCi('7654321');
    expect(masked).toBe('*****321');
    expect(masked).not.toContain('7654');
  });
});
