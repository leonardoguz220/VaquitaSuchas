/**
 * Datos simulados de la moderación de cupos (spec 009, RF-009-12 a RF-009-14). La cola se vacía al
 * decidir sobre una publicación: restaurar o eliminar cierra sus reportes. Las validaciones de
 * motivo imitan lo que respondería el servidor. Nombres y textos inventados.
 */
import { ApiError } from './http';
import type {
  ListingModerationAction,
  ListingModerationResult,
  ReportedListing,
} from './admin-moderation';

const LATENCY_MS = 350;
const REASON_MIN = 10;
const REASON_MAX = 300;

function delay<T>(value: () => T): Promise<T> {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      try {
        resolve(value());
      } catch (error) {
        reject(error);
      }
    }, LATENCY_MS);
  });
}

function seedListings(): ReportedListing[] {
  return [
    {
      listingId: 'cupo-netflix-premium',
      groupId: 'g-netflix',
      groupName: 'Netflix de la oficina',
      serviceName: 'Netflix',
      status: 'oculta',
      slotsOffered: 1,
      hiddenAt: '2026-10-17T09:00:00Z',
      reportCount: 3,
      description: 'Cupo barato, escríbeme por WhatsApp al número de mi perfil para pagar directo.',
      publishedAt: '2026-10-10T12:00:00Z',
      reports: [
        {
          reason: 'conducta_indebida',
          comment: 'Pide pagar fuera del flujo de la solicitud.',
          createdAt: '2026-10-16T10:00:00Z',
        },
        { reason: 'datos_falsos', comment: null, createdAt: '2026-10-16T12:00:00Z' },
        {
          reason: 'spam',
          comment: 'Tiene datos de contacto en la descripción.',
          createdAt: '2026-10-17T09:00:00Z',
        },
      ],
    },
    {
      listingId: 'cupo-youtube-familiar',
      groupId: 'g-youtube',
      groupName: 'Familia Vargas',
      serviceName: 'YouTube Premium',
      status: 'activa',
      slotsOffered: 3,
      hiddenAt: null,
      reportCount: 1,
      description: 'Grupo de la familia Vargas. Cobro el día 1, pago por QR.',
      publishedAt: '2026-10-02T12:00:00Z',
      reports: [
        {
          reason: 'datos_falsos',
          comment: 'El precio es distinto al del catálogo.',
          createdAt: '2026-10-14T15:00:00Z',
        },
      ],
    },
  ];
}

let listings: ReportedListing[] = seedListings();

/** Vuelve a los datos iniciales (pruebas). */
export function resetModerationMock() {
  listings = seedListings();
}

export function listReports(): Promise<ReportedListing[]> {
  return delay(() => listings.map((item) => ({ ...item, reports: [...item.reports] })));
}

export function decide(
  listingId: string,
  decision: ListingModerationAction,
  reason: string,
): Promise<ListingModerationResult> {
  return delay(() => {
    const trimmed = reason.trim();
    if (trimmed.length < REASON_MIN || trimmed.length > REASON_MAX) {
      throw new ApiError(
        400,
        'VALIDATION_ERROR',
        `El motivo va de ${REASON_MIN} a ${REASON_MAX} caracteres.`,
      );
    }
    const found = listings.find((item) => item.listingId === listingId);
    if (!found) throw new ApiError(404, 'NOT_FOUND', 'Publicación no encontrada.');
    // La decisión cierra la cola de esa publicación.
    listings = listings.filter((item) => item.listingId !== listingId);
    return { listingId, decision, status: decision === 'restore' ? 'activa' : 'cerrada' };
  });
}
