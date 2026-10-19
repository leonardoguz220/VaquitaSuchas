import { validateRegistration } from './validate-registration.js';

const valid = {
  fullName: 'Ana Prueba',
  email: 'ana@example.com',
  ci: '1234567',
  password: 'clave-segura-123',
  passwordConfirmation: 'clave-segura-123',
};

describe('validateRegistration', () => {
  it('datos válidos no devuelven errores', () => {
    expect(validateRegistration(valid)).toEqual({ fields: {}, rules: [] });
  });

  it('CA-003-03: una contraseña de 8 caracteres incumple la política', () => {
    const result = validateRegistration({
      ...valid,
      password: 'abc12345',
      passwordConfirmation: 'abc12345',
    });
    expect(result.fields.password).toEqual(['WEAK_PASSWORD']);
    expect(result.rules).toContain('min_length');
  });

  it('CA-003-25: una CI inválida se rechaza', () => {
    expect(validateRegistration({ ...valid, ci: '12ab' }).fields.ci).toEqual(['INVALID_CI']);
  });

  it('la confirmación debe coincidir y el nombre tener 2 a 80 caracteres', () => {
    const result = validateRegistration({
      ...valid,
      fullName: ' A ',
      passwordConfirmation: 'otra',
    });
    expect(result.fields.fullName).toEqual(['INVALID_NAME']);
    expect(result.fields.passwordConfirmation).toEqual(['PASSWORD_MISMATCH']);
  });
});
