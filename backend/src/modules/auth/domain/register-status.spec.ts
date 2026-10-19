import { registerStatus } from './register-status.js';

describe('registerStatus', () => {
  const now = new Date('2026-10-19T12:00:00Z');
  const open = { expiresAt: new Date('2026-10-19T12:05:00Z'), usedAt: null, outcome: null };

  it('CA-003-27: un token vigente sin usar espera la verificación', () => {
    expect(registerStatus(open, false, now)).toEqual({
      status: 'pending',
      expiresAt: '2026-10-19T12:05:00.000Z',
    });
  });

  it('CA-003-28: un token vencido o usado sin resultado pide un enlace nuevo', () => {
    expect(
      registerStatus({ ...open, expiresAt: new Date('2026-10-19T11:59:00Z') }, false, now),
    ).toEqual({ status: 'expired' });
    expect(
      registerStatus({ ...open, usedAt: now, outcome: 'rechazado_contacto_ajeno' }, false, now),
    ).toEqual({
      status: 'expired',
    });
    expect(registerStatus(null, false, now)).toEqual({ status: 'expired' });
  });

  it('CA-003-25 y CA-003-26: los rechazos llevan su código', () => {
    const used = { ...open, usedAt: now };
    expect(registerStatus({ ...used, outcome: 'rechazado_no_boliviano' }, false, now)).toEqual({
      status: 'rejected',
      code: 'PHONE_NOT_BOLIVIAN',
    });
    expect(registerStatus({ ...used, outcome: 'rechazado_duplicado' }, false, now)).toEqual({
      status: 'rejected',
      code: 'PHONE_ALREADY_REGISTERED',
    });
    expect(registerStatus({ ...used, outcome: 'rechazado_duplicado' }, true, now)).toEqual({
      status: 'rejected',
      code: 'TELEGRAM_ALREADY_REGISTERED',
    });
  });

  it('CA-003-22: un bloqueo responde el código genérico', () => {
    expect(
      registerStatus({ ...open, usedAt: now, outcome: 'rechazado_bloqueado' }, false, now),
    ).toEqual({ status: 'rejected', code: 'REGISTRATION_NOT_ALLOWED' });
  });
});
