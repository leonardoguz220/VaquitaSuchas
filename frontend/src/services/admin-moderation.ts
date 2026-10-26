/**
 * Cliente de la moderación de cupos libres (spec 009, `contracts/api.md`, Moderación; RF-009-12 a
 * RF-009-14), conectado al backend (T032). Los motivos y comentarios de los reportes vienen como
 * texto plano: la pantalla nunca los interpreta como HTML. Toda decisión notifica al titular
 * (RF-009-14), por eso la respuesta no lo repite.
 */
import { apiRequest } from './http';

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
  listingId: string;
  groupId: string;
  groupName: string;
  serviceName: string;
  /** `oculta` tras 3 reportes de personas distintas; `activa` si solo tiene reportes. */
  status: 'activa' | 'oculta';
  slotsOffered: number;
  /** Descripción de la publicación, en texto plano; `null` si no escribió ninguna. */
  description: string | null;
  publishedAt: string;
  hiddenAt: string | null;
  reportCount: number;
  reports: ListingReportItem[];
}

export type ListingModerationAction = 'restore' | 'delete' | 'delete-and-suspend';

/** Resultado de una decisión (RF-009-13): la publicación queda `activa` o `cerrada`. */
export interface ListingModerationResult {
  listingId: string;
  decision: ListingModerationAction;
  status: 'activa' | 'cerrada';
}

const LISTINGS_API = '/api/admin/listings';

function decide(
  listingId: string,
  action: ListingModerationAction,
  reason: string,
): Promise<ListingModerationResult> {
  return apiRequest<ListingModerationResult>(
    `${LISTINGS_API}/${encodeURIComponent(listingId)}/${action}`,
    { method: 'POST', body: { reason } },
  );
}

/** `GET /admin/listings/reports` (RF-009-12). */
export async function listReportedListings(): Promise<ReportedListing[]> {
  const { items } = await apiRequest<{ items: ReportedListing[] }>(`${LISTINGS_API}/reports`);
  return items;
}

/** `POST /admin/listings/:id/restore` con `{ reason }` (RF-009-13, CA-009-14). */
export function restoreListing(
  listingId: string,
  reason: string,
): Promise<ListingModerationResult> {
  return decide(listingId, 'restore', reason);
}

/** `POST /admin/listings/:id/delete` con `{ reason }` (RF-009-13, CA-009-15). Cierre definitivo. */
export function deleteListing(listingId: string, reason: string): Promise<ListingModerationResult> {
  return decide(listingId, 'delete', reason);
}

/** `POST /admin/listings/:id/delete-and-suspend` con `{ reason }` (RF-009-13). */
export function deleteAndSuspendListing(
  listingId: string,
  reason: string,
): Promise<ListingModerationResult> {
  return decide(listingId, 'delete-and-suspend', reason);
}
