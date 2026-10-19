import {
  REGISTER_IP_LIMIT,
  TG_TOKEN_LIMIT,
  retryAfterSeconds,
  secretExpiry,
  tokenExpiry,
  underLimit,
} from './registration.js';

describe('límites y vencimientos del registro', () => {
  const now = new Date('2026-10-19T12:00:00Z');

  it('RF-003-23: 10 registros por hora por IP', () => {
    expect(underLimit(9, REGISTER_IP_LIMIT)).toBe(true);
    expect(underLimit(10, REGISTER_IP_LIMIT)).toBe(false);
  });

  it('CA-003-29: el sexto token en una hora se rechaza', () => {
    expect(underLimit(4, TG_TOKEN_LIMIT)).toBe(true);
    expect(underLimit(5, TG_TOKEN_LIMIT)).toBe(false);
  });

  it('el token vence a los 10 minutos y el secreto a las 24 horas', () => {
    expect(tokenExpiry(now).toISOString()).toBe('2026-10-19T12:10:00.000Z');
    expect(secretExpiry(now).toISOString()).toBe('2026-10-20T12:00:00.000Z');
  });

  it('la espera se cuenta desde el evento más antiguo de la ventana', () => {
    const oldest = new Date('2026-10-19T11:30:00Z');
    expect(retryAfterSeconds(oldest, now)).toBe(30 * 60);
    expect(retryAfterSeconds(new Date('2026-10-19T10:00:00Z'), now)).toBe(1);
  });
});
