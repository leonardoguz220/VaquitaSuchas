import { ApiError } from '@/services/http';
import { LOGIN_ERROR_MESSAGES, mapLoginError } from './login-errors';

describe('mapLoginError (contrato 003, POST /auth/login)', () => {
  it('CA-003-05 / RNF-003-02: INVALID_CREDENTIALS da el aviso genérico sin marcar campos', () => {
    expect(mapLoginError(new ApiError(401, 'INVALID_CREDENTIALS', 'x'))).toEqual({
      fieldErrors: {},
      formError: { kind: 'general', message: 'Correo o contraseña incorrectos.' },
    });
  });

  it('CA-003-05: el mensaje no depende del texto del servidor (se decide por code)', () => {
    const a = mapLoginError(new ApiError(401, 'INVALID_CREDENTIALS', 'El correo no existe'));
    const b = mapLoginError(new ApiError(401, 'INVALID_CREDENTIALS', 'Contraseña errónea'));
    expect(a).toEqual(b);
  });

  it.each([
    [90, '01:30'],
    [300, '05:00'],
    [9, '00:09'],
  ])(
    'CA-003-06 / RNF-003-04: RATE_LIMITED con %i s muestra la espera "%s" en mm:ss',
    (seconds, text) => {
      const view = mapLoginError(
        new ApiError(429, 'RATE_LIMITED', 'x', { retryAfterSeconds: seconds }),
      );
      expect(view.formError).toEqual({
        kind: 'rateLimited',
        message: `Hiciste demasiados intentos. Espera ${text} para volver a intentarlo.`,
        retryAfterSeconds: seconds,
      });
    },
  );

  it.each([0, -5, Number.NaN, Number.POSITIVE_INFINITY, '90'])(
    'CA-003-06: RATE_LIMITED con retryAfterSeconds inválido (%s) no da cuenta regresiva',
    (value) => {
      const view = mapLoginError(
        new ApiError(429, 'RATE_LIMITED', 'x', { retryAfterSeconds: value as number }),
      );
      expect(view.formError).toEqual({
        kind: 'general',
        message: 'Hiciste demasiados intentos. Espera unos minutos e inténtalo de nuevo.',
      });
    },
  );

  it('CA-003-06: RATE_LIMITED con fracción de segundo redondea hacia arriba', () => {
    expect(
      mapLoginError(new ApiError(429, 'RATE_LIMITED', 'x', { retryAfterSeconds: 89.2 })).formError
        ?.retryAfterSeconds,
    ).toBe(90);
  });

  it('RNF-003-04: RATE_LIMITED sin retryAfterSeconds usa "unos minutos"', () => {
    expect(mapLoginError(new ApiError(429, 'RATE_LIMITED', 'x')).formError?.message).toBe(
      'Hiciste demasiados intentos. Espera unos minutos e inténtalo de nuevo.',
    );
  });

  it('RNF-003-04: VALIDATION_ERROR marca cada campo de details.fields', () => {
    const view = mapLoginError(
      new ApiError(400, 'VALIDATION_ERROR', 'x', {
        fields: { email: ['INVALID_EMAIL'], password: ['REQUIRED'], otro: ['X'] },
      }),
    );
    expect(view.formError).toBeNull();
    expect(view.fieldErrors).toEqual({
      email: 'Escribe un correo válido, por ejemplo ana@gmail.com.',
      password: LOGIN_ERROR_MESSAGES.invalidField,
    });
  });

  it('RNF-003-04: VALIDATION_ERROR sin campos conocidos da un aviso general', () => {
    expect(mapLoginError(new ApiError(400, 'VALIDATION_ERROR', 'x')).formError).toEqual({
      kind: 'general',
      message: LOGIN_ERROR_MESSAGES.reviewForm,
    });
  });

  it.each([
    new ApiError(0, 'NETWORK_ERROR', 'x'),
    new ApiError(503, 'SERVICE_UNAVAILABLE', 'x'),
    new ApiError(504, 'UPSTREAM_TIMEOUT', 'x'),
  ])('RNF-003-04: sin conexión ($statusCode) muestra el aviso con Reintentar', (error) => {
    expect(mapLoginError(error).formError).toEqual({
      kind: 'connection',
      message: 'No se pudo contactar con el servidor.',
    });
  });

  it('RNF-003-04: otro error muestra el mensaje genérico', () => {
    expect(mapLoginError(new ApiError(500, 'INTERNAL_ERROR', 'x')).formError).toEqual({
      kind: 'general',
      message: 'Ocurrió un error inesperado. Inténtalo de nuevo.',
    });
  });
});
