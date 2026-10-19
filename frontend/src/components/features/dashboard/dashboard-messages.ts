/**
 * Textos del panel y los reportes (plan 006 §6). Los errores se eligen por `code` y estado HTTP,
 * nunca por `message` (contrato 000 A.2). Ningún texto calcula montos ni porcentajes: todo sale
 * de la API.
 */
import { isConnectionError, type ApiError } from '@/services/http';
import type { ReportRole } from '@/services/reports';
import { REGISTER_ERROR_MESSAGES } from '../auth/register-errors';

export const DASHBOARD_MESSAGES = {
  connection: REGISTER_ERROR_MESSAGES.connection,
  unexpected: REGISTER_ERROR_MESSAGES.unexpected,
  invalidMonth: 'Ese mes no es válido. Elige otro.',
  groupNotFound: 'No encontramos esa suscripción entre las tuyas.',
  noData: 'Sin dato',
  savingsEstimated: 'Estimado frente al precio individual',
  ownerReference: 'Cuota de referencia',
  debtsScope: 'Incluye todas tus suscripciones y todos los meses.',
  inReviewNote: 'No suman a lo que debes mientras el titular los revisa.',
} as const;

/** Detalle del aviso cuando falla una carga del panel que no es un `401`. */
export function dashboardErrorMessage(error: ApiError): string {
  if (error.statusCode === 400) return DASHBOARD_MESSAGES.invalidMonth;
  if (error.statusCode === 404) return DASHBOARD_MESSAGES.groupNotFound;
  return isConnectionError(error) ? DASHBOARD_MESSAGES.connection : DASHBOARD_MESSAGES.unexpected;
}

export const ROLE_LABEL: Record<ReportRole, string> = {
  miembro: 'Miembro',
  titular: 'Titular',
};

/** `1 cobro` / `3 cobros`. */
export function chargesCount(count: number): string {
  return `${count} ${count === 1 ? 'cobro' : 'cobros'}`;
}
