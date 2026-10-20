import { REGISTER_MESSAGES } from './auth-validation';
import {
  EMPTY_CHANGE_PASSWORD_VALUES,
  PROFILE_VALIDATION_MESSAGES,
  firstChangePasswordFieldWithError,
  validateChangePasswordForm,
  validateFullName,
  type ChangePasswordFormValues,
} from './profile-validation';

const EMAIL = 'ana.quispe@gmail.com';

const valid: ChangePasswordFormValues = {
  currentPassword: 'vaquita2026',
  newPassword: 'nuevaClave2027',
  newPasswordConfirmation: 'nuevaClave2027',
};

describe('lib/profile-validation (ayuda de UX del perfil, T039)', () => {
  it('RF-003-14: el nombre válido (2 a 80 caracteres sin contar espacios de los bordes) no tiene error', () => {
    expect(validateFullName('Ana Quispe')).toBeUndefined();
    expect(validateFullName('  Al  ')).toBeUndefined();
    expect(validateFullName('a'.repeat(80))).toBeUndefined();
  });

  it('RNF-003-04: nombre vacío, de 1 caracter o de más de 80 da el mensaje en español', () => {
    expect(validateFullName('   ')).toBe(REGISTER_MESSAGES.fullNameRequired);
    expect(validateFullName('A')).toBe(REGISTER_MESSAGES.fullNameLength);
    expect(validateFullName('a'.repeat(81))).toBe(REGISTER_MESSAGES.fullNameLength);
  });

  it('RF-003-15: un formulario completo y con la nueva contraseña válida no tiene errores', () => {
    expect(validateChangePasswordForm(valid, EMAIL)).toEqual({});
  });

  it('RNF-003-04: el formulario vacío pide la actual, la nueva y la confirmación', () => {
    expect(validateChangePasswordForm(EMPTY_CHANGE_PASSWORD_VALUES, EMAIL)).toEqual({
      currentPassword: PROFILE_VALIDATION_MESSAGES.currentPasswordRequired,
      newPassword: REGISTER_MESSAGES.passwordRules,
      newPasswordConfirmation: REGISTER_MESSAGES.confirmationRequired,
    });
  });

  it('RF-003-15: la nueva contraseña igual al correo no cumple las reglas (regla con el correo de la cuenta)', () => {
    const errors = validateChangePasswordForm(
      { ...valid, newPassword: 'Ana.Quispe@gmail.com1', newPasswordConfirmation: 'x' },
      'ana.quispe@gmail.com1',
    );
    expect(errors.newPassword).toBe(REGISTER_MESSAGES.passwordRules);
  });

  it('RNF-003-04: la confirmación distinta da "Las contraseñas no coinciden."', () => {
    const errors = validateChangePasswordForm(
      { ...valid, newPasswordConfirmation: 'otraClave2027' },
      EMAIL,
    );
    expect(errors).toEqual({ newPasswordConfirmation: REGISTER_MESSAGES.passwordMismatch });
  });

  it('RNF-003-04: el foco va al primer campo con error en el orden de la pantalla', () => {
    expect(
      firstChangePasswordFieldWithError({ newPasswordConfirmation: 'x', newPassword: 'y' }),
    ).toBe('newPassword');
    expect(firstChangePasswordFieldWithError({})).toBeUndefined();
  });
});
