import { LOGIN_MESSAGES, REGISTER_MESSAGES } from '@/lib/auth-validation';
import { ApiError } from '@/services/http';
import {
  RECOVER_MESSAGES,
  forgotRateLimitedMessage,
  mapForgotPasswordError,
  mapResetPasswordError,
} from './recover-errors';

describe('recover-errors: POST /auth/password/forgot', () => {
  it('CA-003-13: RATE_LIMITED con retryAfterSeconds da la espera en minutos', () => {
    const view = mapForgotPasswordError(
      new ApiError(429, 'RATE_LIMITED', 'x', { retryAfterSeconds: 1130 }),
    );
    expect(view.fieldErrors).toEqual({});
    expect(view.formError).toEqual({
      kind: 'general',
      message: 'Ya pediste 3 enlaces en la última hora. Espera 19 minutos para pedir otro.',
    });
  });

  it('CA-003-13: RATE_LIMITED sin retryAfterSeconds da el mensaje sin número', () => {
    expect(mapForgotPasswordError(new ApiError(429, 'RATE_LIMITED', 'x')).formError?.message).toBe(
      'Ya pediste 3 enlaces en la última hora. Espera unos minutos para pedir otro.',
    );
  });

  it('CA-003-13: una espera de hasta 60 s se dice en singular', () => {
    expect(forgotRateLimitedMessage({ retryAfterSeconds: 45 })).toBe(
      'Ya pediste 3 enlaces en la última hora. Espera 1 minuto para pedir otro.',
    );
    expect(forgotRateLimitedMessage({ retryAfterSeconds: -5 })).toBe(
      RECOVER_MESSAGES.rateLimitedNoTime,
    );
  });

  it('RNF-003-04: VALIDATION_ERROR del correo va al campo', () => {
    expect(
      mapForgotPasswordError(
        new ApiError(400, 'VALIDATION_ERROR', 'x', { fields: { email: ['INVALID_EMAIL'] } }),
      ),
    ).toEqual({ fieldErrors: { email: LOGIN_MESSAGES.emailInvalid }, formError: null });
  });

  it('RNF-003-04: VALIDATION_ERROR sin campos da un aviso general', () => {
    expect(mapForgotPasswordError(new ApiError(400, 'VALIDATION_ERROR', 'x')).formError).toEqual({
      kind: 'general',
      message: RECOVER_MESSAGES.reviewForm,
    });
  });

  it('RNF-003-04: red, 503 y 504 son errores de conexión con Reintentar', () => {
    for (const error of [
      new ApiError(0, 'NETWORK_ERROR', 'x'),
      new ApiError(503, 'SERVICE_UNAVAILABLE', 'x'),
      new ApiError(504, 'GATEWAY_TIMEOUT', 'x'),
    ]) {
      expect(mapForgotPasswordError(error).formError?.kind).toBe('connection');
    }
  });

  it('RNF-003-04: otro código da el mensaje genérico', () => {
    expect(mapForgotPasswordError(new ApiError(500, 'INTERNAL_ERROR', 'x')).formError).toEqual({
      kind: 'general',
      message: RECOVER_MESSAGES.unexpected,
    });
  });
});

describe('recover-errors: POST /auth/password/reset', () => {
  it('CA-003-11: RESET_TOKEN_INVALID marca el enlace como inválido', () => {
    expect(
      mapResetPasswordError(new ApiError(410, 'RESET_TOKEN_INVALID', 'x', { canRequestNew: true })),
    ).toEqual({ invalidLink: true, fieldErrors: {}, formError: null });
  });

  it('RF-003-12: VALIDATION_ERROR con WEAK_PASSWORD va al campo de la contraseña nueva', () => {
    const view = mapResetPasswordError(
      new ApiError(400, 'VALIDATION_ERROR', 'x', {
        fields: { newPassword: ['WEAK_PASSWORD'], newPasswordConfirmation: ['MISMATCH'] },
      }),
    );
    expect(view).toEqual({
      invalidLink: false,
      fieldErrors: {
        newPassword: RECOVER_MESSAGES.weakPassword,
        newPasswordConfirmation: REGISTER_MESSAGES.passwordMismatch,
      },
      formError: null,
    });
  });

  it('RNF-003-04: VALIDATION_ERROR sin campos conocidos da un aviso general', () => {
    expect(
      mapResetPasswordError(
        new ApiError(400, 'VALIDATION_ERROR', 'x', { fields: { token: ['X'] } }),
      ).formError,
    ).toEqual({ kind: 'general', message: RECOVER_MESSAGES.reviewForm });
  });

  it('RNF-003-04: sin conexión da Reintentar y otro código el mensaje genérico', () => {
    expect(
      mapResetPasswordError(new ApiError(503, 'SERVICE_UNAVAILABLE', 'x')).formError?.kind,
    ).toBe('connection');
    expect(mapResetPasswordError(new ApiError(500, 'INTERNAL_ERROR', 'x')).formError).toEqual({
      kind: 'general',
      message: RECOVER_MESSAGES.unexpected,
    });
  });
});
