import { formatPhone } from './phone';

describe('formatPhone (solo presentación)', () => {
  it('RF-003-14: separa el prefijo +591 del número que entrega la API', () => {
    expect(formatPhone('+59171234567')).toBe('+591 71234567');
  });

  it('RF-003-14: cualquier otro valor se muestra tal cual, sin inventar dígitos', () => {
    expect(formatPhone('+5917123456')).toBe('+5917123456');
    expect(formatPhone('71234567')).toBe('71234567');
    expect(formatPhone('')).toBe('');
  });
});
