import { formatDateLaPaz } from '@/lib/dates';
import { isConnectionError, NETWORK_ERROR_CODE, type ApiError } from '@/services/http';
import type { ListingFormInput, OwnerListing } from '@/services/group-listing';
import { listingErrorCode, slotsText } from './listing-messages';

export const LISTING_TEXT_MAX = 300;

/** Aviso fijo del formulario y de la pestaña (RF-008-01, mockup PublicarCupos). */
export const LISTING_FIXED_NOTICE =
  'Aceptar a alguien cambia la cuota de todos desde el siguiente cobro.';

export interface ListingFormValues {
  slotsOffered: string;
  description: string;
  conditions: string;
}

export interface ListingFormErrors {
  slotsOffered?: string;
  description?: string;
  conditions?: string;
}

export const EMPTY_LISTING_FORM: ListingFormValues = {
  slotsOffered: '',
  description: '',
  conditions: '',
};

/** Valores del formulario a partir de la publicación actual (para editar). */
export function formValuesOf(listing: OwnerListing): ListingFormValues {
  return {
    slotsOffered: String(listing.slotsOffered),
    description: listing.description ?? '',
    conditions: listing.conditions ?? '',
  };
}

/**
 * Ayuda en el cliente: cupos enteros de 1 hasta los libres y textos de hasta 300 caracteres. La
 * API vuelve a validar todo (`400`, `422 NO_FREE_SLOTS`).
 */
export function validateListingForm(
  values: ListingFormValues,
  freeSlots: number,
): ListingFormErrors {
  const errors: ListingFormErrors = {};
  const slots = Number(values.slotsOffered);
  if (values.slotsOffered.trim() === '' || !Number.isInteger(slots) || slots < 1) {
    errors.slotsOffered = 'Indica al menos 1 cupo.';
  } else if (slots > freeSlots) {
    errors.slotsOffered =
      freeSlots > 0 ? `Solo hay ${slotsText(freeSlots)}.` : 'No hay cupos libres.';
  }
  if (values.description.trim().length > LISTING_TEXT_MAX) {
    errors.description = `Máximo ${LISTING_TEXT_MAX} caracteres.`;
  }
  if (values.conditions.trim().length > LISTING_TEXT_MAX) {
    errors.conditions = `Máximo ${LISTING_TEXT_MAX} caracteres.`;
  }
  return errors;
}

/** Cuerpo de `POST` y `PATCH`: los textos vacíos llegan como `null`. */
export function toListingInput(values: ListingFormValues): ListingFormInput {
  return {
    slotsOffered: Number(values.slotsOffered),
    description: values.description.trim() || null,
    conditions: values.conditions.trim() || null,
  };
}

/** Línea de estado de la publicación según lo que devolvió la API (RF-008-05). */
export function listingStatusText(listing: OwnerListing): string {
  switch (listing.status) {
    case 'activa':
      return `Publicación activa hasta el ${formatDateLaPaz(listing.expiresAt)}`;
    case 'oculta':
      return 'Publicación oculta';
    case 'expirada':
      return `Publicación expirada el ${formatDateLaPaz(listing.expiresAt)}`;
    default:
      return 'Sin publicación';
  }
}

/** Error de un envío, por `code` o por la regla de `422 BUSINESS_RULE` (nunca el `message` crudo). */
export function ownerListingErrorText(error: ApiError): string {
  if (error.code === NETWORK_ERROR_CODE || isConnectionError(error)) {
    return 'Sin conexión con el servidor. Revisa tu internet e intenta de nuevo.';
  }
  switch (listingErrorCode(error)) {
    case 'LISTING_ALREADY_ACTIVE':
      return 'El grupo ya tiene una publicación activa.';
    case 'NO_FREE_SLOTS':
      return 'No hay cupos libres.';
    case 'LISTING_HIDDEN':
      return 'La publicación está oculta por reportes; espera la revisión.';
    case 'LISTING_NOT_FOUND':
      return 'No encontramos la publicación. Recarga la página.';
    case 'ACCOUNT_RESTRICTED':
      return 'Tu cuenta está suspendida y no puede publicar cupos.';
    case 'GROUP_CLOSED':
      return 'El grupo está cerrado y no admite publicaciones.';
    case 'GROUP_FROZEN':
      return 'El grupo está congelado por ahora.';
    case 'GROUP_NOT_ACCEPTING':
      return 'El grupo no está recibiendo miembros ahora.';
    case 'VALIDATION_ERROR':
      return `Revisa los cupos y los textos (hasta ${LISTING_TEXT_MAX} caracteres).`;
    case 'STALE_STATE':
      return 'La publicación cambió; recargamos los datos.';
    default:
      return 'No pudimos guardar la publicación. Intenta de nuevo.';
  }
}
