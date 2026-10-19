/**
 * Textos de los cupos libres (plan 008 §6). Los errores se eligen por `code` y estado HTTP, nunca
 * por `message` (contrato 000 A.2). Nada aquí calcula cuotas ni cupos: todo sale de la API.
 */
import { formatDateLaPaz, formatDateTimeLaPaz } from '@/lib/dates';
import { isConnectionError, type ApiError } from '@/services/http';
import type { CannotRequestReason, ListingReportReason, ListingView } from '@/services/listings';
import { REGISTER_ERROR_MESSAGES } from '../auth/register-errors';

export const LISTING_MESSAGES = {
  connection: REGISTER_ERROR_MESSAGES.connection,
  unexpected: REGISTER_ERROR_MESSAGES.unexpected,
  shareChangeNotice: 'Aceptar a alguien cambia la cuota de todos desde el siguiente cobro.',
  stale: 'La publicación cambió mientras la editabas. Cargamos los datos actualizados.',
} as const;

/** Mensaje genérico de una carga que falló (que no es un `401`). */
export function listingLoadErrorMessage(error: ApiError): string {
  return isConnectionError(error) ? LISTING_MESSAGES.connection : LISTING_MESSAGES.unexpected;
}

export interface ListingActionOutcome {
  message: string;
  /** Cambió en el servidor: se vuelve a pedir la publicación. */
  refresh: boolean;
  /** El error es del número de cupos. */
  field: 'slotsOffered' | null;
}

/**
 * Error al publicar, editar, renovar o retirar (contrato 008): `409 LISTING_ALREADY_ACTIVE`,
 * `409 STALE_STATE`, `422 NO_FREE_SLOTS`, `GROUP_NOT_ACCEPTING`, `GROUP_CLOSED`, `GROUP_FROZEN`,
 * `LISTING_HIDDEN`, `403 ACCOUNT_RESTRICTED`, `404 LISTING_NOT_FOUND` y `400 VALIDATION_ERROR`.
 */
export function listingActionOutcome(error: ApiError): ListingActionOutcome {
  const plain = (message: string, refresh = false): ListingActionOutcome => ({
    message,
    refresh,
    field: null,
  });
  switch (error.code) {
    case 'NO_FREE_SLOTS':
      return {
        message: 'No hay cupos libres para ofrecer esa cantidad. Prueba con menos cupos.',
        refresh: false,
        field: 'slotsOffered',
      };
    case 'LISTING_ALREADY_ACTIVE':
      return plain('El grupo ya tiene una publicación activa. Cargamos la actual.', true);
    case 'STALE_STATE':
      return plain(LISTING_MESSAGES.stale, true);
    case 'LISTING_NOT_FOUND':
      return plain('La publicación ya no existe. Cargamos el estado actual.', true);
    case 'LISTING_HIDDEN':
      return plain(
        'La publicación está oculta por reportes: podrás renovarla cuando un administrador la revise.',
      );
    case 'GROUP_NOT_ACCEPTING':
      return plain('El grupo no está recibiendo miembros. Actívalo en los ajustes para publicar.');
    case 'GROUP_CLOSED':
      return plain('El grupo está cerrado: no se pueden publicar cupos.');
    case 'GROUP_FROZEN':
      return plain('El grupo está congelado: no se pueden publicar cupos.');
    case 'ACCOUNT_RESTRICTED':
      return plain('Tu cuenta está restringida: no puedes publicar cupos.');
  }
  if (error.statusCode === 400) {
    return plain('Revisa los datos: ofrece al menos 1 cupo y usa hasta 300 caracteres por texto.');
  }
  if (error.statusCode === 403) return plain('Solo el titular del grupo puede publicar cupos.');
  return plain(listingLoadErrorMessage(error));
}

/** «Abierta hasta el …» o «Se abre el …» (RF-008-03, CA-008-23) con las fechas de la API. */
export function entryWindowText(window: ListingView['entryWindow']): string | null {
  if (window.isOpen && window.closesAt) {
    return `Abierta hasta el ${formatDateTimeLaPaz(window.closesAt)}`;
  }
  if (!window.isOpen && window.opensAt) return `Se abre el ${formatDateLaPaz(window.opensAt)}`;
  return window.isOpen ? 'Ventana de ingreso abierta' : 'Ventana de ingreso cerrada';
}

/** `1 cupo` / `2 cupos`. */
export function slotsText(count: number): string {
  return `${count} ${count === 1 ? 'cupo' : 'cupos'}`;
}

/**
 * Por qué no se puede solicitar, según el `cannotRequestReason` de la API (plan 008 §6). La API
 * decide; aquí solo se elige el texto.
 */
export function cannotRequestText(
  reason: CannotRequestReason | null,
  window: ListingView['entryWindow'],
): string {
  switch (reason) {
    case 'VENTANA_CERRADA':
      return window.opensAt
        ? `La ventana de ingreso está cerrada. Se abre el ${formatDateLaPaz(window.opensAt)}.`
        : 'La ventana de ingreso está cerrada.';
    case 'SOLICITUD_ACTIVA':
      return 'Ya tienes una solicitud en este grupo.';
    case 'DEMASIADAS_SOLICITUDES':
      return 'Ya tienes 5 solicitudes activas. Espera a que alguna termine para pedir otro cupo.';
    case 'COBROS_ABIERTOS':
      return 'Tienes cobros sin saldar en este grupo. Págalos antes de pedir un cupo.';
    case 'SIN_CUPOS':
      return 'En este momento no quedan cupos disponibles.';
    case 'CUENTA_RESTRINGIDA':
      return 'Tu cuenta está restringida: no puedes solicitar cupos.';
    default:
      return 'Por ahora no puedes solicitar un cupo en esta publicación.';
  }
}

/** Primer nombre para el rótulo del mensaje: «Mensaje para Valeria». */
export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}

/** Motivos del reporte (RF-008-17), en el orden del contrato. */
export const REPORT_REASONS: Array<{ value: ListingReportReason; label: string }> = [
  { value: 'spam', label: 'Spam o publicidad' },
  { value: 'datos_falsos', label: 'Datos falsos' },
  { value: 'conducta_indebida', label: 'Conducta indebida' },
  { value: 'otro', label: 'Otro motivo' },
];

export interface ReportErrorOutcome {
  message: string;
  /** Ya no tiene sentido volver a intentarlo: se oculta el botón. */
  finished: boolean;
}

/** Error de `POST /listings/:id/reports` por `code` y estado HTTP (contrato 008). */
export function reportErrorOutcome(error: ApiError): ReportErrorOutcome {
  switch (error.code) {
    case 'ALREADY_REPORTED':
      return { message: 'Ya reportaste esta publicación. Gracias por avisar.', finished: true };
    case 'CANNOT_REPORT_OWN_LISTING':
      return { message: 'No puedes reportar tu propia publicación.', finished: true };
    case 'ACCOUNT_RESTRICTED':
      return { message: 'Tu cuenta está restringida: no puedes reportar.', finished: true };
    case 'LISTING_NOT_FOUND':
      return { message: 'Esta publicación ya no está activa.', finished: true };
  }
  if (error.statusCode === 429) {
    return {
      message: 'Llegaste al límite de 10 reportes por día. Vuelve a intentarlo mañana.',
      finished: true,
    };
  }
  if (error.statusCode === 400) {
    return {
      message: 'Revisa el motivo y usa hasta 300 caracteres en el comentario.',
      finished: false,
    };
  }
  if (error.statusCode === 404) {
    return { message: 'Esta publicación ya no está activa.', finished: true };
  }
  return { message: listingLoadErrorMessage(error), finished: false };
}
