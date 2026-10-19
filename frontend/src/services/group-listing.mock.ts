/**
 * Datos simulados de la publicación del titular (T011, spec 008) mientras el backend no está
 * conectado. Las cuotas estimadas llegan resueltas, como las entregaría la API: aquí no se calcula
 * ninguna regla del dominio. Los cupos libres son fijos en `MOCK_FREE_SLOTS`; el servidor los
 * calcula de verdad. Nombres, montos y textos inventados.
 */
import { ApiError } from './http';
import type { ListingView } from './listings';
import type {
  GroupListingSummary,
  ListingFormInput,
  OwnerListing,
  UpdateListingInput,
} from './group-listing';

const LATENCY_MS = 350;
const LISTING_DAYS = 30;
const DAY_MS = 86_400_000;
const TEXT_MAX = 300;

/** Cupos libres que el simulador usa para validar (el servidor los calcula). */
export const MOCK_FREE_SLOTS = 2;

/** Espera la latencia simulada; si la petición se cancela, rechaza con `AbortError`. */
function delay<T>(value: () => T, signal?: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('La petición se canceló.', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      try {
        resolve(value());
      } catch (error) {
        reject(error);
      }
    }, LATENCY_MS);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** Estado en memoria por grupo. Sin publicación al empezar. */
const store = new Map<string, OwnerListing>();

/** Pruebas y pantallas de desarrollo: deja el simulador sin publicaciones. */
export function resetMockOwnerListings(): void {
  store.clear();
}

/** Pruebas: fija la publicación de un grupo (o `null` para quitarla). */
export function setMockOwnerListing(groupId: string, listing: OwnerListing | null): void {
  if (listing) store.set(groupId, listing);
  else store.delete(groupId);
}

const isEditable = (listing: OwnerListing | undefined): listing is OwnerListing =>
  listing !== undefined && (listing.status === 'activa' || listing.status === 'oculta');

function isOpen(listing: OwnerListing | undefined): listing is OwnerListing {
  return listing !== undefined && ['activa', 'oculta', 'expirada'].includes(listing.status);
}

/** Vista pública de la publicación: solo cuando está `activa` (RF-008-03). */
function previewOf(listing: OwnerListing): ListingView | null {
  if (listing.status !== 'activa') return null;
  return {
    id: listing.id,
    service: {
      name: 'Prime Video',
      planName: 'Estándar',
      logoUrl: null,
      brandColor: null,
      category: null,
    },
    slotsOffered: listing.slotsOffered,
    estimatedShareCents: 930,
    estimatedShareLabel: 'estimada',
    billingDay: 18,
    owner: { fullName: 'Valeria Choque', level: 'Excelente' },
    description: listing.description,
    conditions: listing.conditions,
    publishedAt: listing.publishedAt,
    expiresAt: listing.expiresAt,
    entryWindow: { isOpen: true, opensAt: null, closesAt: listing.expiresAt },
    myRequest: null,
    canRequest: false,
    cannotRequestReason: null,
  };
}

function withPreview(listing: OwnerListing): OwnerListing {
  return { ...listing, preview: previewOf(listing) };
}

function expiryFrom(now: Date): string {
  return new Date(now.getTime() + LISTING_DAYS * DAY_MS).toISOString();
}

/** Valida cupos y textos como el servidor (`400`), y que no pasen de los libres (`422`). */
function checkInput(input: Partial<ListingFormInput>) {
  const fields: { field: string; message: string }[] = [];
  if (input.slotsOffered !== undefined) {
    if (!Number.isInteger(input.slotsOffered) || input.slotsOffered < 1) {
      fields.push({ field: 'slotsOffered', message: 'Debe ser un número de al menos 1.' });
    }
  }
  if ((input.description ?? '').length > TEXT_MAX) {
    fields.push({ field: 'description', message: `Máximo ${TEXT_MAX} caracteres.` });
  }
  if ((input.conditions ?? '').length > TEXT_MAX) {
    fields.push({ field: 'conditions', message: `Máximo ${TEXT_MAX} caracteres.` });
  }
  if (fields.length > 0) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Datos inválidos.', { fields });
  }
  if (input.slotsOffered !== undefined && input.slotsOffered > MOCK_FREE_SLOTS) {
    throw new ApiError(422, 'BUSINESS_RULE', 'No hay cupos libres.', { code: 'NO_FREE_SLOTS' });
  }
}

export function getOwnerListing(
  groupId: string,
  signal?: AbortSignal,
): Promise<OwnerListing | null> {
  return delay(() => {
    const listing = store.get(groupId);
    return listing && listing.status !== 'retirada' && listing.status !== 'cerrada'
      ? withPreview(listing)
      : null;
  }, signal);
}

export function getGroupListingSummary(
  groupId: string,
  signal?: AbortSignal,
): Promise<GroupListingSummary> {
  return delay(() => {
    const listing = store.get(groupId);
    if (listing?.status !== 'activa') {
      return { active: false, slotsOffered: null, expiresAt: null };
    }
    return { active: true, slotsOffered: listing.slotsOffered, expiresAt: listing.expiresAt };
  }, signal);
}

/** `201`: publicación `activa` por 30 días. `409` si ya hay una abierta (CA-008-03). */
export function createOwnerListing(
  groupId: string,
  input: ListingFormInput,
): Promise<OwnerListing> {
  return delay(() => {
    const current = store.get(groupId);
    if (isOpen(current)) {
      throw new ApiError(409, 'LISTING_ALREADY_ACTIVE', 'El grupo ya tiene una publicación.');
    }
    checkInput(input);
    const now = new Date();
    const listing: OwnerListing = {
      id: `listing-${groupId}`,
      groupId,
      status: 'activa',
      slotsOffered: input.slotsOffered,
      description: input.description,
      conditions: input.conditions,
      publishedAt: now.toISOString(),
      expiresAt: expiryFrom(now),
      renewedAt: null,
      hiddenAt: null,
      endReason: null,
      reportCount: 0,
      openRequests: 0,
      preview: null,
      version: 1,
    };
    store.set(groupId, listing);
    return withPreview(listing);
  });
}

/** `200`: edita una `activa` u `oculta`. `409 STALE_STATE` si cambió la versión. */
export function updateOwnerListing(
  groupId: string,
  input: UpdateListingInput,
): Promise<OwnerListing> {
  return delay(() => {
    const current = store.get(groupId);
    if (!isEditable(current)) {
      throw new ApiError(404, 'LISTING_NOT_FOUND', 'No encontramos la publicación.');
    }
    if (input.version !== undefined && input.version !== current.version) {
      throw new ApiError(409, 'STALE_STATE', 'La publicación cambió.');
    }
    checkInput(input);
    const updated: OwnerListing = {
      ...current,
      slotsOffered: input.slotsOffered ?? current.slotsOffered,
      description: input.description !== undefined ? input.description : current.description,
      conditions: input.conditions !== undefined ? input.conditions : current.conditions,
      version: current.version + 1,
    };
    store.set(groupId, updated);
    return withPreview(updated);
  });
}

/** `200`: vuelve a 30 días desde ahora. `422 LISTING_HIDDEN` si está oculta por reportes. */
export function renewOwnerListing(groupId: string): Promise<OwnerListing> {
  return delay(() => {
    const current = store.get(groupId);
    if (!isOpen(current)) {
      throw new ApiError(404, 'LISTING_NOT_FOUND', 'No encontramos la publicación.');
    }
    if (current.status === 'oculta') {
      throw new ApiError(422, 'BUSINESS_RULE', 'La publicación está oculta.', {
        code: 'LISTING_HIDDEN',
      });
    }
    const now = new Date();
    const renewed: OwnerListing = {
      ...current,
      status: 'activa',
      expiresAt: expiryFrom(now),
      renewedAt: now.toISOString(),
      version: current.version + 1,
    };
    store.set(groupId, renewed);
    return withPreview(renewed);
  });
}

/** `204`: pasa la publicación a `retirada`. */
export function retireOwnerListing(groupId: string): Promise<void> {
  return delay(() => {
    const current = store.get(groupId);
    if (!isOpen(current)) {
      throw new ApiError(404, 'LISTING_NOT_FOUND', 'No encontramos la publicación.');
    }
    store.set(groupId, { ...current, status: 'retirada', endReason: 'titular', preview: null });
  });
}
