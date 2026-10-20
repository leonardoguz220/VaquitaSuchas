/**
 * Mensajes de error de `/grupos/nuevo`, elegidos por `code` y `details.rule`, nunca por
 * `message` (contrato 000 A.2 y contrato 001: `POST /groups`, `POST /groups/quote`,
 * `PUT /groups/:id/payment-info`).
 */
import { isConnectionError, type ApiError } from '@/services/http';
import { FORM_MESSAGES, type GroupFormErrors, type GroupFormField } from './new-group-form-model';

export const NEW_GROUP_MESSAGES = {
  connection: 'No se pudo contactar con el servidor.',
  unexpected: 'Ocurrió un error inesperado. Inténtalo de nuevo.',
  reviewForm: 'Revisa los datos marcados en el formulario.',
  notEligible: 'Todavía no puedes crear suscripciones.',
  tooManyGroups: 'Ya llegaste al límite de grupos activos como titular.',
  planNotFound: 'Este plan ya no está disponible. Vuelve atrás y elige otro.',
  outOfRange:
    'El precio debe estar entre Bs 1,00 y Bs 5.000,00 (o su equivalente) y los cupos entre 2 y 20.',
  slotsOverPlan: 'Los cupos no pueden superar los que permite el plan.',
  invalidField: 'Revisa este dato.',
  quoteInvalid: 'Revisa el precio, el tipo de cambio y los cupos para ver la cuota.',
  eligibilityLoadFailed: 'No pudimos comprobar si puedes crear suscripciones.',
  qrTooLarge: 'El QR pesa más de 2 MB.',
  qrUnsupported: 'El QR debe ser una imagen JPG o PNG.',
  qrFailed: 'No pudimos subir el QR.',
} as const;

export interface NewGroupFormError {
  /** `connection` muestra el botón «Reintentar». */
  kind: 'connection' | 'general';
  message: string;
}

export interface CreateGroupErrorView {
  fieldErrors: GroupFormErrors;
  formError: NewGroupFormError | null;
  /** RF-001-21 o RN-001-14: hay que volver a consultar la habilitación y mostrar el panel. */
  eligibilityProblem: boolean;
}

/** Campos del contrato (`details.fields`) → campos del formulario. */
const API_FIELDS: Record<string, GroupFormField> = {
  customServiceName: 'customServiceName',
  name: 'name',
  priceCents: 'price',
  currency: 'price',
  exchangeRate: 'exchangeRate',
  billingDay: 'billingDay',
  totalSlots: 'totalSlots',
  paymentInfoText: 'paymentInfoText',
};

const FIELD_MESSAGES: GroupFormErrors = {
  customServiceName: FORM_MESSAGES.customServiceNameRequired,
  name: FORM_MESSAGES.nameRequired,
  price: FORM_MESSAGES.priceInvalid,
  exchangeRate: FORM_MESSAGES.exchangeRateRequired,
  paymentInfoText: FORM_MESSAGES.paymentTextTooLong,
};

function fieldErrorsFrom(details: ApiError['details']): GroupFormErrors {
  const fields = details?.fields;
  if (typeof fields !== 'object' || fields === null) return {};
  const errors: GroupFormErrors = {};
  for (const apiField of Object.keys(fields)) {
    const field = API_FIELDS[apiField];
    if (field) errors[field] = FIELD_MESSAGES[field] ?? NEW_GROUP_MESSAGES.invalidField;
  }
  return errors;
}

const general = (message: string): NewGroupFormError => ({ kind: 'general', message });

/** Decide dónde y qué mostrar ante un error de `POST /groups`. */
export function mapCreateGroupError(error: ApiError): CreateGroupErrorView {
  const none = { fieldErrors: {}, eligibilityProblem: false };
  if (isConnectionError(error)) {
    return { ...none, formError: { kind: 'connection', message: NEW_GROUP_MESSAGES.connection } };
  }
  const rule = error.details?.rule;
  if (error.code === 'NOT_HOST_ELIGIBLE' || rule === 'RF-001-21') {
    return {
      ...none,
      formError: general(NEW_GROUP_MESSAGES.notEligible),
      eligibilityProblem: true,
    };
  }
  if (error.code === 'TOO_MANY_ACTIVE_GROUPS' || rule === 'RN-001-14') {
    return {
      ...none,
      formError: general(NEW_GROUP_MESSAGES.tooManyGroups),
      eligibilityProblem: true,
    };
  }
  if (rule === 'RN-001-13') {
    return {
      ...none,
      fieldErrors: { totalSlots: NEW_GROUP_MESSAGES.slotsOverPlan },
      formError: null,
    };
  }
  if (rule === 'RN-001-09') return { ...none, formError: general(NEW_GROUP_MESSAGES.outOfRange) };
  if (error.code === 'NOT_FOUND')
    return { ...none, formError: general(NEW_GROUP_MESSAGES.planNotFound) };
  if (error.code === 'VALIDATION_ERROR') {
    const fieldErrors = fieldErrorsFrom(error.details);
    const hasFields = Object.keys(fieldErrors).length > 0;
    return {
      fieldErrors,
      formError: hasFields ? null : general(NEW_GROUP_MESSAGES.reviewForm),
      eligibilityProblem: false,
    };
  }
  return { ...none, formError: general(NEW_GROUP_MESSAGES.unexpected) };
}

/** Mensaje de un error de `POST /groups/quote`. */
export function quoteErrorMessage(error: ApiError): string {
  if (isConnectionError(error)) return NEW_GROUP_MESSAGES.connection;
  if (error.code === 'VALIDATION_ERROR') return NEW_GROUP_MESSAGES.quoteInvalid;
  return NEW_GROUP_MESSAGES.unexpected;
}

/** Mensaje de un error de `PUT /groups/:id/payment-info` al subir el QR. */
export function qrUploadErrorMessage(error: ApiError): string {
  if (isConnectionError(error)) return NEW_GROUP_MESSAGES.connection;
  if (error.code === 'FILE_TOO_LARGE') return NEW_GROUP_MESSAGES.qrTooLarge;
  if (error.code === 'UNSUPPORTED_FILE_TYPE') return NEW_GROUP_MESSAGES.qrUnsupported;
  return NEW_GROUP_MESSAGES.qrFailed;
}
