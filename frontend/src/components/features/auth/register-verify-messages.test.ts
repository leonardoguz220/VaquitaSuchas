import { ApiError } from '@/services/http';
import {
  REGISTER_VERIFY_MESSAGES,
  registerLinkErrorMessage,
  rejectedMessage,
} from './register-verify-messages';

describe('register-verify-messages (RF-003-21, mensajes por code)', () => {
  it.each([
    ['REGISTRATION_NOT_ALLOWED', 'No es posible crear la cuenta con estos datos.'],
    [
      'PHONE_NOT_BOLIVIAN',
      'El número que compartiste no es un celular boliviano. Usa una cuenta de Telegram con un número de Bolivia (+591).',
    ],
    ['PHONE_ALREADY_REGISTERED', 'Ya existe una cuenta con ese celular.'],
    ['TELEGRAM_ALREADY_REGISTERED', 'Ya existe una cuenta con esa cuenta de Telegram.'],
    ['OTRO_CODIGO', 'No es posible crear la cuenta con estos datos.'],
    ['toString', 'No es posible crear la cuenta con estos datos.'],
  ])('CA-003-28: rejected %s muestra su mensaje', (code, message) => {
    expect(rejectedMessage(code)).toBe(message);
  });

  it('CA-003-29: RATE_LIMITED con retryAfterSeconds muestra los minutos de espera', () => {
    const error = new ApiError(429, 'RATE_LIMITED', 'x', { retryAfterSeconds: 1500 });
    expect(registerLinkErrorMessage(error)).toBe('Pediste demasiados enlaces. Espera 25 minutos.');
    expect(
      registerLinkErrorMessage(new ApiError(429, 'RATE_LIMITED', 'x', { retryAfterSeconds: 30 })),
    ).toBe('Pediste demasiados enlaces. Espera 1 minuto.');
  });

  it('CA-003-29: RATE_LIMITED sin retryAfterSeconds muestra el mensaje general de espera', () => {
    expect(registerLinkErrorMessage(new ApiError(429, 'RATE_LIMITED', 'x'))).toBe(
      'Pediste demasiados enlaces. Espera unos minutos.',
    );
  });

  it('RF-003-21: sin conexión o con un error inesperado muestra el mensaje correspondiente', () => {
    expect(registerLinkErrorMessage(new ApiError(0, 'NETWORK_ERROR', 'x'))).toBe(
      REGISTER_VERIFY_MESSAGES.connection,
    );
    expect(registerLinkErrorMessage(new ApiError(500, 'INTERNAL_ERROR', 'Detalle interno'))).toBe(
      REGISTER_VERIFY_MESSAGES.unexpected,
    );
  });
});
