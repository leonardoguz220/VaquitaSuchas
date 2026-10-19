import { ApiError } from '@/services/http';
import {
  mapCreateGroupError,
  NEW_GROUP_MESSAGES,
  qrUploadErrorMessage,
  quoteErrorMessage,
} from './new-group-errors';
import { FORM_MESSAGES } from './new-group-form-model';

describe('Errores de /grupos/nuevo por code (contrato 001)', () => {
  it('CA-001-24: NOT_HOST_ELIGIBLE o rule RF-001-21 piden mostrar qué falta', () => {
    for (const error of [
      new ApiError(422, 'NOT_HOST_ELIGIBLE', 'x'),
      new ApiError(422, 'BUSINESS_RULE', 'x', { rule: 'RF-001-21' }),
    ]) {
      expect(mapCreateGroupError(error)).toEqual({
        fieldErrors: {},
        formError: { kind: 'general', message: NEW_GROUP_MESSAGES.notEligible },
        eligibilityProblem: true,
      });
    }
  });

  it('CA-001-28: TOO_MANY_ACTIVE_GROUPS o rule RN-001-14 también', () => {
    const view = mapCreateGroupError(
      new ApiError(422, 'BUSINESS_RULE', 'x', { rule: 'RN-001-14' }),
    );
    expect(view.eligibilityProblem).toBe(true);
    expect(view.formError?.message).toBe(NEW_GROUP_MESSAGES.tooManyGroups);
  });

  it('CA-001-02: VALIDATION_ERROR lleva cada campo del contrato a su campo del formulario', () => {
    const view = mapCreateGroupError(
      new ApiError(400, 'VALIDATION_ERROR', 'x', {
        fields: { exchangeRate: ['REQUIRED'], priceCents: ['MIN'], billingDay: ['MAX'] },
      }),
    );
    expect(view.fieldErrors).toEqual({
      exchangeRate: FORM_MESSAGES.exchangeRateRequired,
      price: FORM_MESSAGES.priceInvalid,
      billingDay: NEW_GROUP_MESSAGES.invalidField,
    });
    expect(view.formError).toBeNull();
    expect(mapCreateGroupError(new ApiError(400, 'VALIDATION_ERROR', 'x')).formError?.message).toBe(
      NEW_GROUP_MESSAGES.reviewForm,
    );
  });

  it('RF-001-02: RN-001-13, RN-001-09, 404, conexión y código desconocido', () => {
    expect(
      mapCreateGroupError(new ApiError(422, 'BUSINESS_RULE', 'x', { rule: 'RN-001-13' }))
        .fieldErrors.totalSlots,
    ).toBe(NEW_GROUP_MESSAGES.slotsOverPlan);
    expect(
      mapCreateGroupError(new ApiError(422, 'BUSINESS_RULE', 'x', { rule: 'RN-001-09' })).formError
        ?.message,
    ).toBe(NEW_GROUP_MESSAGES.outOfRange);
    expect(mapCreateGroupError(new ApiError(404, 'NOT_FOUND', 'x')).formError?.message).toBe(
      NEW_GROUP_MESSAGES.planNotFound,
    );
    expect(mapCreateGroupError(new ApiError(0, 'NETWORK_ERROR', 'x')).formError?.kind).toBe(
      'connection',
    );
    expect(mapCreateGroupError(new ApiError(500, 'INTERNAL', 'x')).formError?.message).toBe(
      NEW_GROUP_MESSAGES.unexpected,
    );
  });

  it('RF-001-20: errores del QR (413, 415) y de la cotización', () => {
    expect(qrUploadErrorMessage(new ApiError(413, 'FILE_TOO_LARGE', 'x'))).toBe(
      NEW_GROUP_MESSAGES.qrTooLarge,
    );
    expect(qrUploadErrorMessage(new ApiError(415, 'UNSUPPORTED_FILE_TYPE', 'x'))).toBe(
      NEW_GROUP_MESSAGES.qrUnsupported,
    );
    expect(qrUploadErrorMessage(new ApiError(500, 'INTERNAL', 'x'))).toBe(
      NEW_GROUP_MESSAGES.qrFailed,
    );
    expect(quoteErrorMessage(new ApiError(400, 'VALIDATION_ERROR', 'x'))).toBe(
      NEW_GROUP_MESSAGES.quoteInvalid,
    );
    expect(quoteErrorMessage(new ApiError(504, 'GATEWAY_TIMEOUT', 'x'))).toBe(
      NEW_GROUP_MESSAGES.connection,
    );
  });
});
