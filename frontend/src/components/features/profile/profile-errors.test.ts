import { REGISTER_MESSAGES } from '@/lib/auth-validation';
import { ApiError } from '@/services/http';
import { REGISTER_VERIFY_MESSAGES } from '../auth/register-verify-messages';
import {
  PROFILE_MESSAGES,
  mapChangePasswordError,
  mapUpdateNameError,
  phoneChangeRejectedMessage,
  profileLoadErrorMessage,
} from './profile-errors';

const offline = new ApiError(0, 'NETWORK_ERROR', 'No se pudo contactar con el servidor.');

describe('profile-errors (mensajes por code, contrato 000 A.2)', () => {
  it('RNF-003-04: la carga del perfil sin conexión y con error del servidor dan mensajes distintos', () => {
    expect(profileLoadErrorMessage(offline)).toBe(PROFILE_MESSAGES.connection);
    expect(profileLoadErrorMessage(new ApiError(500, 'INTERNAL_ERROR', 'x'))).toBe(
      PROFILE_MESSAGES.unexpected,
    );
  });

  it('RF-003-14: VALIDATION_ERROR de fullName va al campo con el largo permitido, nunca con el message', () => {
    const error = new ApiError(400, 'VALIDATION_ERROR', 'texto interno', {
      fields: { fullName: ['LENGTH'] },
    });
    expect(mapUpdateNameError(error)).toEqual({
      fieldError: REGISTER_MESSAGES.fullNameLength,
      formError: null,
    });
  });

  it('RF-003-14: FIELD_NOT_EDITABLE explica que el correo y la CI no se editan', () => {
    const view = mapUpdateNameError(new ApiError(400, 'FIELD_NOT_EDITABLE', 'texto interno'));
    expect(view.formError).toEqual({ kind: 'general', message: PROFILE_MESSAGES.fieldNotEditable });
  });

  it('RNF-003-04: sin conexión al guardar el nombre ofrece Reintentar (kind connection)', () => {
    expect(mapUpdateNameError(offline).formError?.kind).toBe('connection');
  });

  it('RF-003-15: CURRENT_PASSWORD_WRONG marca el campo de la contraseña actual', () => {
    expect(
      mapChangePasswordError(new ApiError(422, 'CURRENT_PASSWORD_WRONG', 'texto interno')),
    ).toEqual({
      fieldErrors: { currentPassword: 'La contraseña actual no es correcta.' },
      formError: null,
    });
  });

  it('RF-003-15: RATE_LIMITED muestra la espera en minutos', () => {
    const view = mapChangePasswordError(
      new ApiError(429, 'RATE_LIMITED', 'x', { retryAfterSeconds: 600 }),
    );
    expect(view.formError?.message).toBe(
      'Hiciste demasiados intentos. Espera 10 minutos e inténtalo de nuevo.',
    );
  });

  it('RF-003-15: VALIDATION_ERROR marca cada campo; sin campos, aviso general', () => {
    const view = mapChangePasswordError(
      new ApiError(400, 'VALIDATION_ERROR', 'x', {
        fields: { newPassword: ['WEAK_PASSWORD'], newPasswordConfirmation: ['MISMATCH'] },
      }),
    );
    expect(view.fieldErrors).toEqual({
      newPassword: PROFILE_MESSAGES.weakPassword,
      newPasswordConfirmation: REGISTER_MESSAGES.passwordMismatch,
    });
    expect(view.formError).toBeNull();
    expect(mapChangePasswordError(new ApiError(400, 'VALIDATION_ERROR', 'x')).formError).toEqual({
      kind: 'general',
      message: PROFILE_MESSAGES.reviewForm,
    });
  });

  it('CA-003-15: un celular que no es boliviano se rechaza con el mismo mensaje que el registro', () => {
    expect(phoneChangeRejectedMessage('PHONE_NOT_BOLIVIAN')).toBe(
      REGISTER_VERIFY_MESSAGES.phoneNotBolivian,
    );
    expect(phoneChangeRejectedMessage('PHONE_ALREADY_REGISTERED')).toBe(
      REGISTER_VERIFY_MESSAGES.phoneTaken,
    );
  });

  it('RF-003-14: el bloqueo o un código desconocido dan el mensaje genérico, sin decir qué está bloqueado', () => {
    expect(phoneChangeRejectedMessage('REGISTRATION_NOT_ALLOWED')).toBe(
      PROFILE_MESSAGES.phoneNotAllowed,
    );
    expect(phoneChangeRejectedMessage(undefined)).toBe(PROFILE_MESSAGES.phoneNotAllowed);
    expect(phoneChangeRejectedMessage('toString')).toBe(PROFILE_MESSAGES.phoneNotAllowed);
  });
});
