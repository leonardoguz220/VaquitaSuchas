/**
 * Textos del selector de servicio y de plan (plan 004 §6). Los errores se eligen por `code` y
 * estado HTTP, nunca por `message` (contrato 000 A.2).
 */
import { isConnectionError, type ApiError } from '@/services/http';
import { REGISTER_ERROR_MESSAGES } from '../auth/register-errors';

export const CATALOG_MESSAGES = {
  servicesFailed: 'No pudimos cargar los servicios.',
  servicesEmpty: 'Todavía no hay servicios en el catálogo.',
  servicesEmptyHint: 'Puedes crear tu suscripción como un servicio personalizado.',
  moreFailed: 'No pudimos cargar más servicios.',
  plansFailed: 'No pudimos cargar los planes.',
  /** `404 NOT_FOUND`: el servicio se desactivó o se quedó sin planes activos (CA-004-08). */
  serviceUnavailable: 'Este servicio ya no está disponible. Elige otro o crea uno personalizado.',
  priceHint: 'El precio es una sugerencia: podrás cambiarlo.',
  connection: REGISTER_ERROR_MESSAGES.connection,
  unexpected: REGISTER_ERROR_MESSAGES.unexpected,
} as const;

/** Detalle del aviso cuando falla una carga del catálogo que no es un `401`. */
export function catalogLoadErrorMessage(error: ApiError): string {
  return isConnectionError(error) ? CATALOG_MESSAGES.connection : CATALOG_MESSAGES.unexpected;
}

/** Indica si el servicio pedido ya no se ofrece (`404 NOT_FOUND` de `GET /catalog/services/:slug`). */
export function isServiceUnavailable(error: ApiError | null): boolean {
  return error?.statusCode === 404;
}
