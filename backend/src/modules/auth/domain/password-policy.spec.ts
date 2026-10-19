import { validatePassword } from './password-policy.js';

describe('validatePassword', () => {
  it('CA-003-03: rechaza una contraseña de 8 caracteres', () => {
    expect(validatePassword('abcde123', 'a@b.com')).toEqual(['min_length']);
  });

  it('CA-003-03: exige al menos una letra', () => {
    expect(validatePassword('1234567890', 'a@b.com')).toEqual(['letter']);
  });

  it('CA-003-03: exige al menos un número', () => {
    expect(validatePassword('abcdefghij', 'a@b.com')).toEqual(['number']);
  });

  it('CA-003-03: no puede ser igual al correo sin distinguir mayúsculas', () => {
    expect(validatePassword('Persona1234@x.com', 'persona1234@X.com')).toEqual(['not_email']);
  });

  it('CA-003-03: acepta una contraseña válida', () => {
    expect(validatePassword('clave-segura-9', 'a@b.com')).toEqual([]);
  });

  it('CA-003-03: acumula varias reglas incumplidas', () => {
    expect(validatePassword('abc', 'a@b.com')).toEqual(['min_length', 'number']);
  });
});
