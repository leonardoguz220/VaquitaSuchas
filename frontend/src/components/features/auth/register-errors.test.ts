import { REGISTER_MESSAGES } from '@/lib/auth-validation';
import { ApiError } from '@/services/http';
import { REGISTER_ERROR_MESSAGES, mapRegisterError } from './register-errors';

describe('mapRegisterError (contrato 003, POST /auth/register)', () => {
  it('RF-003-01: EMAIL_TAKEN va al campo correo', () => {
    expect(mapRegisterError(new ApiError(409, 'EMAIL_TAKEN', 'x'))).toEqual({
      fieldErrors: { email: 'Ese correo ya está registrado.' },
      formError: null,
    });
  });

  it('RF-003-01: CI_TAKEN va al campo CI', () => {
    expect(mapRegisterError(new ApiError(409, 'CI_TAKEN', 'x'))).toEqual({
      fieldErrors: { ci: 'Ya existe una cuenta con esa cédula.' },
      formError: null,
    });
  });

  it('RF-003-01: REGISTRATION_NOT_ALLOWED es un aviso genérico sin campo', () => {
    expect(mapRegisterError(new ApiError(403, 'REGISTRATION_NOT_ALLOWED', 'x'))).toEqual({
      fieldErrors: {},
      formError: { kind: 'general', message: 'No es posible crear la cuenta con estos datos.' },
    });
  });

  it('RF-003-01: la UX sale del code y no del message', () => {
    const view = mapRegisterError(new ApiError(409, 'EMAIL_TAKEN', 'Mensaje cualquiera'));
    expect(view.fieldErrors.email).toBe(REGISTER_ERROR_MESSAGES.emailTaken);
  });

  it('RF-003-03: VALIDATION_ERROR reparte los códigos de details.fields por campo', () => {
    const view = mapRegisterError(
      new ApiError(400, 'VALIDATION_ERROR', 'x', {
        fields: {
          password: ['WEAK_PASSWORD'],
          ci: ['INVALID_CI'],
          acceptDataPolicy: ['POLICY_NOT_ACCEPTED'],
          email: ['INVALID_EMAIL'],
          fullName: ['TOO_SHORT'],
        },
      }),
    );
    expect(view).toEqual({
      fieldErrors: {
        password: REGISTER_ERROR_MESSAGES.weakPassword,
        ci: REGISTER_MESSAGES.ciInvalid,
        acceptDataPolicy: REGISTER_MESSAGES.policyRequired,
        email: REGISTER_MESSAGES.emailInvalid,
        fullName: REGISTER_ERROR_MESSAGES.invalidField,
      },
      formError: null,
    });
  });

  it('RF-003-01: VALIDATION_ERROR sin campos conocidos muestra un aviso general', () => {
    const view = mapRegisterError(
      new ApiError(400, 'VALIDATION_ERROR', 'x', { fields: { otro: ['X'] } }),
    );
    expect(view.formError).toEqual({
      kind: 'general',
      message: REGISTER_ERROR_MESSAGES.reviewForm,
    });
  });

  it('RF-003-01: RATE_LIMITED sin retryAfterSeconds usa el mensaje base', () => {
    expect(mapRegisterError(new ApiError(429, 'RATE_LIMITED', 'x')).formError).toEqual({
      kind: 'general',
      message: 'Hiciste demasiados intentos. Espera unos minutos e inténtalo de nuevo.',
    });
  });

  it.each([
    [60, 'Espera 1 minuto'],
    [61, 'Espera 2 minutos'],
    [900, 'Espera 15 minutos'],
  ])('RF-003-01: RATE_LIMITED con retryAfterSeconds=%s dice "%s"', (seconds, text) => {
    const view = mapRegisterError(
      new ApiError(429, 'RATE_LIMITED', 'x', { retryAfterSeconds: seconds }),
    );
    expect(view.formError?.message).toContain(text);
  });

  it.each([
    [0, 'NETWORK_ERROR'],
    [503, 'SERVICE_UNAVAILABLE'],
    [504, 'UPSTREAM_TIMEOUT'],
  ])('RF-003-01: %s %s es un error de conexión con reintento', (status, code) => {
    expect(mapRegisterError(new ApiError(status, code, 'x')).formError).toEqual({
      kind: 'connection',
      message: 'No se pudo contactar con el servidor.',
    });
  });

  it('RF-003-01: cualquier otro código muestra el error inesperado', () => {
    expect(mapRegisterError(new ApiError(500, 'INTERNAL_ERROR', 'x')).formError).toEqual({
      kind: 'general',
      message: 'Ocurrió un error inesperado. Inténtalo de nuevo.',
    });
  });
});
