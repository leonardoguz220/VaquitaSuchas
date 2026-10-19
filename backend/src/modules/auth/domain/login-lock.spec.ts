import { loginLockStatus, resetRequestAllowed } from './login-lock.js';

const now = new Date('2026-10-19T12:00:00Z');
const ago = (min: number): Date => new Date(now.getTime() - min * 60_000);

describe('loginLockStatus', () => {
  it('CA-003-06: con 5 fallos en 15 minutos queda bloqueado hasta 15 min después del 5.º', () => {
    const fails = [ago(10), ago(8), ago(6), ago(4), ago(2)];
    const status = loginLockStatus(fails, now);
    expect(status.locked).toBe(true);
    expect(status.until).toEqual(new Date(ago(2).getTime() + 15 * 60_000));
  });

  it('CA-003-06: con 4 fallos no está bloqueado', () => {
    expect(loginLockStatus([ago(10), ago(8), ago(6), ago(4)], now).locked).toBe(false);
  });

  it('CA-003-06: los fallos de hace más de 15 minutos no cuentan', () => {
    expect(loginLockStatus([ago(40), ago(30), ago(20), ago(16), ago(2)], now).locked).toBe(false);
  });

  it('CA-003-06: el bloqueo termina pasados 15 minutos del 5.º fallo', () => {
    const fails = [ago(30), ago(29), ago(28), ago(27), ago(26)];
    expect(loginLockStatus(fails, now).locked).toBe(false);
  });
});

describe('resetRequestAllowed', () => {
  it('RF-003-18: permite hasta 3 pedidos por hora', () => {
    expect(resetRequestAllowed(2)).toBe(true);
    expect(resetRequestAllowed(3)).toBe(false);
    expect(resetRequestAllowed(5, 10)).toBe(true);
  });
});
