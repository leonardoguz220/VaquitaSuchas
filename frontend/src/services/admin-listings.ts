/**
 * Cliente de la moderación de cupos libres (spec 009, `contracts/api.md` § Moderación de cupos;
 * RF-009-12 a RF-009-14). Todos exigen `AdminGuard`; cada acción lleva motivo, queda en auditoría
 * y se avisa al titular (spec 005).
 */
import type { ListingReportReason, ListingStatus } from './listings';
import { apiRequest } from './http';

/** Reporte de una publicación (spec 008). El comentario es texto plano. */
export interface ListingReportEntry {
  reason: ListingReportReason;
  comment: string | null;
  /** ISO 8601 en UTC. */
  createdAt: string;
}

/**
 * Publicación reportada u oculta de `GET /admin/listings/reports`. [NECESITA ACLARACIÓN] El
 * contrato no detalla la respuesta; se toman los campos de la spec 008 y del mockup
 * `AdminModeracion.dc.html`: servicio, cupos, titular, textos, estado y los reportes con su
 * motivo y comentario.
 */
export interface ReportedListing {
  id: string;
  status: ListingStatus;
  service: { name: string; planName: string | null };
  slotsOffered: number;
  owner: { userId: string; fullName: string };
  description: string | null;
  conditions: string | null;
  publishedAt: string;
  hiddenAt: string | null;
  /** Reportes desde la última restauración. */
  reportCount: number;
  reports: ListingReportEntry[];
}

export interface ReportedListingsPage {
  items: ReportedListing[];
  nextCursor: string | null;
}

export type ModerationAction = 'restore' | 'delete' | 'delete-and-suspend';

/** `GET /admin/listings/reports` (RF-009-12): publicaciones reportadas u ocultas. */
export function listReportedListings(
  params: { limit?: number; cursor?: string } = {},
): Promise<ReportedListingsPage> {
  const query = new URLSearchParams();
  if (params.limit !== undefined) query.set('limit', String(params.limit));
  if (params.cursor) query.set('cursor', params.cursor);
  const search = query.toString();
  return apiRequest<ReportedListingsPage>(
    `/api/admin/listings/reports${search ? `?${search}` : ''}`,
  );
}

/**
 * `POST /admin/listings/:id/restore | delete | delete-and-suspend` con `{ reason }` (RF-009-13;
 * CA-009-14, CA-009-15). [NECESITA ACLARACIÓN] El contrato no dice qué devuelve.
 */
export function moderateListing(
  listingId: string,
  action: ModerationAction,
  input: { reason: string },
): Promise<unknown> {
  return apiRequest<unknown>(`/api/admin/listings/${encodeURIComponent(listingId)}/${action}`, {
    method: 'POST',
    body: input,
  });
}
