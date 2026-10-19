/**
 * Textos y formato de «Cupos libres» (spec 008, plan §6). Ningún texto decide un estado: los cupos,
 * la cuota, el nivel del titular y la ventana llegan de la API tal como vienen.
 */
import type { BadgeTone } from '@/components/ui';
import type { CatalogCategory } from '@/services/catalog';
import { isConnectionError, type ApiError } from '@/services/http';
import type { ListingEntryWindow, ListingService } from '@/services/listings';
import { formatDateLaPaz } from '@/lib/dates';

export const LISTING_MESSAGES = {
  title: 'Cupos libres',
  intro: 'Grupos que buscan miembros. Solo puedes pedir un cupo durante su ventana de ingreso.',
  loading: 'Cargando cupos libres…',
  empty: 'No hay cupos libres por ahora',
  emptyHint: 'Vuelve más tarde o cambia los filtros.',
  loadFailed: 'No pudimos cargar los cupos libres.',
  loadMoreFailed: 'No pudimos cargar más publicaciones.',
  offlineTitle: 'Sin conexión.',
  offline: 'Revisa tu internet y vuelve a intentarlo.',
  unexpected: 'Ocurrió un error inesperado. Inténtalo de nuevo.',
  retry: 'Reintentar',
  loadMore: 'Cargar más',
  notFound: 'Esta publicación ya no existe',
  notFoundHint: 'Puede que el grupo ya no busque miembros o que ya seas parte de él.',
  backToList: 'Volver a cupos libres',
  loadingDetail: 'Cargando la publicación…',
  estimateNote:
    'La cuota es estimada, no es el monto final. El monto final se fija cuando pagas tu ingreso.',
  noDescription: 'El titular no escribió una descripción.',
  noConditions: 'El titular no indicó condiciones.',
  filtersLabel: 'Filtrar cupos libres',
  serviceLabel: 'Servicio',
  servicePlaceholder: 'Ej. Netflix',
  categoryLabel: 'Categoría',
  allCategories: 'Todas las categorías',
  quotaLabel: 'Cuota',
  sortLabel: 'Ordenar por',
  ownerLabel: 'Titular',
  descriptionTitle: 'Descripción',
  conditionsTitle: 'Condiciones',
  windowLabel: 'Ventana de ingreso',
} as const;

export const CATEGORY_LABEL: Record<CatalogCategory, string> = {
  video: 'Video',
  musica: 'Música',
  juegos: 'Juegos',
  educacion: 'Educación',
  almacenamiento: 'Almacenamiento',
  otras: 'Otras',
};

/** Servicio con su plan: `Prime Video · Estándar`. */
export function serviceTitle(service: Pick<ListingService, 'name' | 'planName'>): string {
  return service.planName ? `${service.name} · ${service.planName}` : service.name;
}

/** Cupos libres: `1 cupo libre` o `2 cupos libres`. */
export function slotsText(count: number): string {
  return count === 1 ? '1 cupo libre' : `${count} cupos libres`;
}

export function billingDayText(day: number): string {
  return `cobro el día ${day}`;
}

/** Texto y tono de la ventana de ingreso, con las fechas que entrega la API en La Paz. */
export function windowStatus(entryWindow: ListingEntryWindow): {
  text: string;
  tone: BadgeTone;
} {
  if (entryWindow.isOpen) {
    const text = entryWindow.closesAt
      ? `Abierta hasta el ${formatDateLaPaz(entryWindow.closesAt)}`
      : 'Abierta';
    return { text, tone: 'success' };
  }
  if (entryWindow.opensAt) {
    return { text: `Se abre el ${formatDateLaPaz(entryWindow.opensAt)}`, tone: 'neutral' };
  }
  return { text: 'Cerrada', tone: 'neutral' };
}

/** Mensaje de error de una carga: sin conexión o un error genérico (nunca el `message` crudo). */
export function listingErrorText(error: ApiError): { title: string; body: string } {
  if (isConnectionError(error)) {
    return { title: LISTING_MESSAGES.offlineTitle, body: LISTING_MESSAGES.offline };
  }
  return { title: LISTING_MESSAGES.loadFailed, body: LISTING_MESSAGES.unexpected };
}
