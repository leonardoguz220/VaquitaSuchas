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
    [300, 'Espera 5 minutos'],
    [61, 'Espera 2 minutos'],
    [30, 'Espera 1 minuto e'],
  ])('RNF-003-04: RATE_LIMITED con %i s muestra "%s"', (seconds, text) => {
    const view = mapLoginError(
      new ApiError(429, 'RATE_LIMITED', 'x', { retryAfterSeconds: seconds }),
    );
    expect(view.formError?.kind).toBe('general');
    expect(view.formError?.message).toContain(text);
    expect(view.formError?.message).toMatch(/^Hiciste demasiados intentos\./);
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
