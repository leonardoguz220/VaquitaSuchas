import {
  EMPTY_LOGIN_VALUES,
  EMPTY_REGISTER_VALUES,
  LOGIN_MESSAGES,
  REGISTER_MESSAGES,
  evaluatePasswordRules,
  firstFieldWithError,
  firstLoginFieldWithError,
  validateLoginForm,
  validateRegisterForm,
  type RegisterFormValues,
} from './auth-validation';

const valid: RegisterFormValues = {
  fullName: 'Ana Quispe Mamani',
  email: 'ana.quispe@gmail.com',
  ci: '7845123',
  password: 'vaquita2026',
  passwordConfirmation: 'vaquita2026',
  acceptDataPolicy: true,
};

function metById(password: string, email = 'ana@gmail.com') {
  return Object.fromEntries(evaluatePasswordRules(password, email).map((r) => [r.id, r.met]));
}

describe('lib/auth-validation (ayuda de UX del registro)', () => {
  it('RF-003-03: las cuatro reglas de la política, en orden y con su texto', () => {
    expect(evaluatePasswordRules('', '').map((r) => r.label)).toEqual([
      'Al menos 10 caracteres',
      'Al menos una letra',
      'Al menos un número',
      'Distinta de tu correo',
    ]);
  });

  it('RF-003-03: una contraseña vacía no cumple ninguna regla', () => {
    expect(metById('')).toEqual({
      minLength: false,
      letter: false,
      number: false,
      notEmail: false,
    });
  });

  it('CA-003-03: una contraseña de 8 caracteres no cumple el mínimo de 10', () => {
    expect(metById('abcd1234').minLength).toBe(false);
    expect(metById('abcde12345').minLength).toBe(true);
  });

  it('RF-003-03: exige al menos una letra y al menos un número', () => {
    expect(metById('1234567890')).toMatchObject({ letter: false, number: true });
    expect(metById('abcdefghij')).toMatchObject({ letter: true, number: false });
  });

  it('RF-003-03: la contraseña no puede ser igual al correo (sin distinguir mayúsculas)', () => {
    expect(metById('Ana1@gmail.com', 'ana1@gmail.com').notEmail).toBe(false);
    expect(metById('vaquita2026', 'ana1@gmail.com').notEmail).toBe(true);
  });

  it('RF-003-01: datos válidos no tienen errores', () => {
    expect(validateRegisterForm(valid)).toEqual({});
  });

  it('RF-003-01: el formulario vacío marca todos los campos obligatorios', () => {
    expect(validateRegisterForm(EMPTY_REGISTER_VALUES)).toEqual({
      fullName: REGISTER_MESSAGES.fullNameRequired,
      email: REGISTER_MESSAGES.emailRequired,
      ci: REGISTER_MESSAGES.ciRequired,
      password: REGISTER_MESSAGES.passwordRules,
      passwordConfirmation: REGISTER_MESSAGES.confirmationRequired,
      acceptDataPolicy: REGISTER_MESSAGES.policyRequired,
    });
  });

  it.each(['A', 'x'.repeat(81)])(
    'RF-003-01: el nombre "%s" está fuera de 2 a 80 caracteres',
    (n) => {
      expect(validateRegisterForm({ ...valid, fullName: n }).fullName).toBe(
        REGISTER_MESSAGES.fullNameLength,
      );
    },
  );

  it.each(['1234', '12345678901', '78451A3', '7845 123'])(
    'RF-003-01: la CI "%s" no es de 5 a 10 dígitos',
    (ci) => {
      expect(validateRegisterForm({ ...valid, ci }).ci).toBe(REGISTER_MESSAGES.ciInvalid);
    },
  );

  it('RF-003-01: correo con forma inválida', () => {
    expect(validateRegisterForm({ ...valid, email: 'ana@' }).email).toBe(
      REGISTER_MESSAGES.emailInvalid,
    );
  });

  it('RF-003-01: la confirmación distinta de la contraseña es un error', () => {
    expect(
      validateRegisterForm({ ...valid, passwordConfirmation: 'otra2026xx' }).passwordConfirmation,
    ).toBe(REGISTER_MESSAGES.passwordMismatch);
  });

  it('CA-003-34: sin aceptar la política hay error en la casilla', () => {
    expect(validateRegisterForm({ ...valid, acceptDataPolicy: false })).toEqual({
      acceptDataPolicy: REGISTER_MESSAGES.policyRequired,
    });
  });

  it('RNF-003-04: el primer campo con error sigue el orden de la pantalla', () => {
    expect(firstFieldWithError({ acceptDataPolicy: 'x', ci: 'y' })).toBe('ci');
    expect(firstFieldWithError({})).toBeUndefined();
  });
});

describe('lib/auth-validation (ayuda de UX del ingreso, T029)', () => {
  it('RNF-003-04: correo y contraseña presentes no tienen errores', () => {
    expect(validateLoginForm({ email: ' ana.quispe@gmail.com ', password: 'x' })).toEqual({});
  });

  it('RNF-003-04: vacío pide el correo y la contraseña', () => {
    expect(validateLoginForm(EMPTY_LOGIN_VALUES)).toEqual({
      email: LOGIN_MESSAGES.emailRequired,
      password: LOGIN_MESSAGES.passwordRequired,
    });
  });

  it('RNF-003-04: correo con forma inválida', () => {
    expect(validateLoginForm({ email: 'ana@', password: 'x' }).email).toBe(
      LOGIN_MESSAGES.emailInvalid,
    );
  });

  it('RNF-003-02: no aplica las reglas de la contraseña nueva (lo decide el servidor)', () => {
    expect(validateLoginForm({ email: 'ana@gmail.com', password: '123' })).toEqual({});
  });

  it('RNF-003-04: el primer campo con error sigue el orden de la pantalla', () => {
    expect(firstLoginFieldWithError({ password: 'x', email: 'y' })).toBe('email');
    expect(firstLoginFieldWithError({ password: 'x' })).toBe('password');
    expect(firstLoginFieldWithError({})).toBeUndefined();
  });
});
