import { canLogin } from './login.js';

describe('canLogin', () => {
  const verified = new Date('2026-10-19T12:00:00Z');

  it('una cuenta activa y verificada puede entrar', () => {
    expect(canLogin({ status: 'activo', verified_at: verified })).toBe(true);
  });

  it('CA-003-18 y CA-003-23: suspendida o baneada no entra', () => {
    expect(canLogin({ status: 'suspendido', verified_at: verified })).toBe(false);
    expect(canLogin({ status: 'baneado', verified_at: verified })).toBe(false);
  });

  it('una cuenta sin verificar no entra', () => {
    expect(canLogin({ status: 'activo', verified_at: null })).toBe(false);
  });
});
