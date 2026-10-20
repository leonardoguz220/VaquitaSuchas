import { MAX_MAIL_ATTEMPTS, resetTokenExpiry, validateNewPassword } from './password-reset.js';

describe('recuperación de contraseña (dominio)', () => {
  it('RF-003-11: el enlace vence a los 30 minutos', () => {
    expect(resetTokenExpiry(new Date('2026-10-19T12:00:00Z')).toISOString()).toBe(
      '2026-10-19T12:30:00.000Z',
    );
  });

  it('el correo se reintenta hasta 3 veces', () => {
    expect(MAX_MAIL_ATTEMPTS).toBe(3);
  });

  it('RF-003-03: una contraseña nueva válida no devuelve errores', () => {
    expect(validateNewPassword('nueva-clave-456', 'nueva-clave-456', 'a@example.com')).toEqual({
      fields: {},
      rules: [],
    });
  });

  it('RF-003-03: débil o sin coincidir devuelve los códigos de campo', () => {
    const result = validateNewPassword('corta1', 'otra', 'a@example.com');
    expect(result.fields.newPassword).toEqual(['WEAK_PASSWORD']);
    expect(result.rules).toContain('min_length');
    expect(result.fields.newPasswordConfirmation).toEqual(['PASSWORD_MISMATCH']);
  });
});
