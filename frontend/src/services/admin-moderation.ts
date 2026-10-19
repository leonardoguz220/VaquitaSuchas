/**
 * Cliente de la moderación de cupos libres (spec 009, `contracts/api.md`, Moderación; RF-009-12 a
 * RF-009-14). Por ahora responde con datos simulados de `admin-moderation.mock.ts`; al conectar el
 * backend solo cambia el cuerpo por `apiRequest`. Los motivos y comentarios de los reportes vienen
 * como texto plano: la pantalla nunca los interpreta como HTML.
 */
import * as mock from './admin-moderation.mock';

export type ListingReportReason = 'spam' | 'datos_falsos' | 'conducta_indebida' | 'otro';

export interface ListingReportItem {
  reason: ListingReportReason;
  /** Texto plano del reporte; `null` si la persona no escribió comentario. */
  comment: string | null;
  /** ISO 8601 en UTC. */
  createdAt: string;
}

/** Publicación reportada u oculta (`GET /admin/listings/reports`, RF-009-12). */
export interface ReportedListing {
  id: string;
  title: string;
  /** `oculta` tras 3 reportes de personas distintas; `visible` si solo tiene reportes. */
  status: 'oculta' | 'visible';
  ownerName: string;
  /** Descripción de la publicación, en texto plano. */
  description: string;
  publishedAt: string;
  reports: ListingReportItem[];
}

/** Resultado de una decisión: queda registrada con quién y por qué (CA-009-14, RF-009-13). */
export interface ListingModerationResult {
  listingId: string;
  action: 'restaurar' | 'eliminar' | 'eliminar_y_suspender';
  reason: string;
  decidedBy: string;
  decidedAt: string;
  /** La API avisa al titular de la decisión (RF-009-14, CA-009-15). */
  ownerNotified: boolean;
}

/** `GET /admin/listings/reports` (RF-009-12). */
export function listReportedListings(): Promise<ReportedListing[]> {
  return mock.listReports();
}

/** `POST /admin/listings/:id/restore` con `{ reason }` (RF-009-13, CA-009-14). */
export function restoreListing(
  listingId: string,
  reason: string,
): Promise<ListingModerationResult> {
  return mock.decide(listingId, 'restaurar', reason);
}

/** `POST /admin/listings/:id/delete` con `{ reason }` (RF-009-13, CA-009-15). Cierre definitivo. */
export function deleteListing(listingId: string, reason: string): Promise<ListingModerationResult> {
  return mock.decide(listingId, 'eliminar', reason);
}

/** `POST /admin/listings/:id/delete-and-suspend` con `{ reason }` (RF-009-13). */
export function deleteAndSuspendListing(
  listingId: string,
  reason: string,
): Promise<ListingModerationResult> {
  return mock.decide(listingId, 'eliminar_y_suspender', reason);
}
