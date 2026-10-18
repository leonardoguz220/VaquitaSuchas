import { extractStartToken, formatMinutesSeconds, isSameInstant } from './telegram-link';

describe('telegram-link (RF-003-21)', () => {
  it('RF-003-21: extractStartToken lee el parámetro start del enlace al bot', () => {
    expect(extractStartToken('https://t.me/vaquita_bot?start=abc123')).toBe('abc123');
  });

  it.each([null, undefined, '', 'no es url', 'https://t.me/vaquita_bot', 'https://t.me/x?start='])(
    'RF-003-21: extractStartToken devuelve null con %p',
    (value) => {
      expect(extractStartToken(value)).toBeNull();
    },
  );

  it('RF-003-21: isSameInstant compara instantes aunque cambie el formato', () => {
    expect(isSameInstant('2026-10-18T17:10:00Z', '2026-10-18T17:10:00.000Z')).toBe(true);
    expect(isSameInstant('2026-10-18T17:10:00Z', '2026-10-18T17:20:00Z')).toBe(false);
    expect(isSameInstant('x', 'x')).toBe(false);
  });

  it.each([
    [600, '10:00'],
    [582, '09:42'],
    [59, '00:59'],
    [0, '00:00'],
    [-5, '00:00'],
  ])('RF-003-21: formatMinutesSeconds(%i) es %s', (seconds, text) => {
    expect(formatMinutesSeconds(seconds)).toBe(text);
  });
});
