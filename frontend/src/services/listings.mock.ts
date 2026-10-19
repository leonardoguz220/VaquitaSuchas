/**
 * Datos simulados de la spec 008 mientras el backend no está conectado. Las cuotas estimadas, los
 * niveles, las ventanas y los cupos libres ya vienen resueltos, como los entregaría la API: aquí
 * no se calcula ninguna regla del dominio. El filtrado y el orden solo imitan lo que haría el
 * servidor con la query. Nombres, montos y textos inventados.
 */
import { ApiError } from './http';
import type {
  ListingCannotRequestReason,
  ListingOwner,
  ListingRequestOptions,
  ListingSeatInput,
  ListingSeatRequest,
  ListingSort,
  ListingView,
  ListingsPage,
} from './listings';
import type { RatingLevel } from './reputation';

const LATENCY_MS = 350;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

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

const id = (suffix: string) => `7a1f0c2e-0000-4000-8000-0000000000${suffix}`;

/** Ids fijos del simulador, para probar cada pantalla a mano y en las pruebas. */
export const MOCK_LISTING_IDS = {
  primeVideo: id('01'),
  spotifyFamily: id('02'),
  youtubePremium: id('03'),
  netflixPremium: id('04'),
  disney: id('05'),
  spotifyDuo: id('06'),
  googleOne: id('07'),
  netflixStandard: id('08'),
  /** Llena: sin cupos libres. La búsqueda no la lista, pero su detalle sí responde. */
  maxFull: id('09'),
  /** El usuario ya tiene una solicitud activa en este grupo. */
  activeRequest: id('10'),
} as const;

/** Un id que no existe: el detalle responde `404 LISTING_NOT_FOUND`. */
export const MOCK_MISSING_LISTING_ID = '7a1f0c2e-0000-4000-8000-00000000dead';

/** Solicitud activa propia en `MOCK_LISTING_IDS.activeRequest` (spec 010). */
export const MOCK_ACTIVE_REQUEST_ID = '9b2e4d10-0000-4000-8000-000000000001';
/** Id de la solicitud que devuelve el simulador al abrir una nueva. */
export const MOCK_NEW_REQUEST_ID = '9b2e4d10-0000-4000-8000-000000000002';

const EXPIRES_AT = '2026-10-29T14:00:00.000Z';
/** Ventana abierta hasta el 19 de octubre (23:59 en La Paz). */
const CLOSES_OCT_19 = '2026-10-20T03:59:00.000Z';
/** Ventana abierta hasta el 20 de octubre (23:59 en La Paz). */
const CLOSES_OCT_20 = '2026-10-21T03:59:00.000Z';
/** Ventana abierta hasta el 21 de octubre (23:59 en La Paz). */
const CLOSES_OCT_21 = '2026-10-22T03:59:00.000Z';
/** Ventanas que se abren el 1 y el 10 de noviembre (00:00 en La Paz). */
const OPENS_NOV_1 = '2026-11-01T04:00:00.000Z';
const OPENS_NOV_10 = '2026-11-10T04:00:00.000Z';

const owner = (fullName: string, level: RatingLevel): ListingOwner => ({ fullName, level });

/** Publicaciones simuladas, con cuota, cupos y ventana ya resueltos. */
const LISTINGS: ListingView[] = [
  {
    id: MOCK_LISTING_IDS.primeVideo,
    service: {
      name: 'Prime Video',
      planName: 'Estándar',
      logoUrl: null,
      brandColor: '#0F5E8C',
      category: 'video',
    },
    slotsOffered: 2,
    estimatedShareCents: 930,
    estimatedShareLabel: 'estimada',
    billingDay: 18,
    owner: owner('Valeria Choque', 'Excelente'),
    description:
      'Somos una familia que comparte Prime Video desde hace un año. Buscamos dos personas puntuales.\nCada perfil es personal, no se cambia la contraseña.',
    conditions: 'Pago por QR dentro del plazo. Si alguien se atrasa, el sistema lo retira.',
    publishedAt: '2026-10-15T14:00:00.000Z',
    expiresAt: EXPIRES_AT,
    entryWindow: { isOpen: true, opensAt: null, closesAt: CLOSES_OCT_20 },
    myRequest: null,
    canRequest: true,
    cannotRequestReason: null,
  },
  {
    id: MOCK_LISTING_IDS.spotifyFamily,
    service: {
      name: 'Spotify',
      planName: 'Familiar',
      logoUrl: null,
      brandColor: '#14743A',
      category: 'musica',
    },
    slotsOffered: 1,
    estimatedShareCents: 1940,
    estimatedShareLabel: 'estimada',
    billingDay: 17,
    owner: owner('Rodrigo Salazar Paz', 'Bueno'),
    // Texto plano: el correo y el enlace se muestran como texto, sin hacerse clicables.
    description:
      'Plan familiar con seis cuentas. Dudas: escribe a grupo@ejemplo.com o mira https://ejemplo.com/spotify',
    conditions: null,
    publishedAt: '2026-10-16T09:30:00.000Z',
    expiresAt: EXPIRES_AT,
    entryWindow: { isOpen: true, opensAt: null, closesAt: CLOSES_OCT_19 },
    myRequest: null,
    canRequest: true,
    cannotRequestReason: null,
  },
  {
    id: MOCK_LISTING_IDS.youtubePremium,
    service: {
      name: 'YouTube Premium',
      planName: 'Familiar',
      logoUrl: null,
      brandColor: '#B42318',
      category: 'video',
    },
    slotsOffered: 3,
    estimatedShareCents: 1460,
    estimatedShareLabel: 'estimada',
    billingDay: 1,
    owner: owner('Marco Vargas', 'Excelente'),
    description: 'Grupo tranquilo, sin cambios de plan durante el año.',
    conditions: 'Cobro el primer día del mes.',
    publishedAt: '2026-10-17T12:00:00.000Z',
    expiresAt: EXPIRES_AT,
    entryWindow: { isOpen: false, opensAt: OPENS_NOV_1, closesAt: null },
    myRequest: null,
    canRequest: false,
    cannotRequestReason: 'VENTANA_CERRADA',
  },
  {
    id: MOCK_LISTING_IDS.netflixPremium,
    service: {
      name: 'Netflix',
      planName: 'Premium',
      logoUrl: null,
      brandColor: '#A4161A',
      category: 'video',
    },
    slotsOffered: 1,
    estimatedShareCents: 3200,
    estimatedShareLabel: 'estimada',
    billingDay: 10,
    owner: owner('Sofía Mamani', 'Bueno'),
    description: 'Perfil de cuatro pantallas en HD.',
    conditions: 'Pago antes del corte. Sin cuentas compartidas fuera del grupo.',
    publishedAt: '2026-10-14T18:45:00.000Z',
    expiresAt: EXPIRES_AT,
    entryWindow: { isOpen: false, opensAt: OPENS_NOV_10, closesAt: null },
    myRequest: null,
    canRequest: false,
    cannotRequestReason: 'VENTANA_CERRADA',
  },
  {
    id: MOCK_LISTING_IDS.disney,
    service: {
      name: 'Disney+',
      planName: 'Estándar',
      logoUrl: null,
      brandColor: '#113CCF',
      category: 'video',
    },
    slotsOffered: 2,
    estimatedShareCents: 1250,
    estimatedShareLabel: 'estimada',
    billingDay: 12,
    owner: owner('Luis Condori', 'Regular'),
    description: null,
    conditions: 'Pago puntual. Dos perfiles por persona.',
    publishedAt: '2026-10-18T08:10:00.000Z',
    expiresAt: EXPIRES_AT,
    entryWindow: { isOpen: true, opensAt: null, closesAt: CLOSES_OCT_21 },
    myRequest: null,
    canRequest: true,
    cannotRequestReason: null,
  },
  {
    id: MOCK_LISTING_IDS.spotifyDuo,
    service: {
      name: 'Spotify',
      planName: 'Duo',
      logoUrl: null,
      brandColor: '#14743A',
      category: 'musica',
    },
    slotsOffered: 1,
    estimatedShareCents: 1880,
    estimatedShareLabel: 'estimada',
    billingDay: 25,
    owner: owner('Carla Ticona', 'Nuevo'),
    description: 'Cuenta Duo para dos personas que viven juntas.',
    conditions: null,
    publishedAt: '2026-10-18T20:00:00.000Z',
    expiresAt: EXPIRES_AT,
    entryWindow: { isOpen: false, opensAt: OPENS_NOV_1, closesAt: null },
    myRequest: null,
    canRequest: false,
    cannotRequestReason: 'VENTANA_CERRADA',
  },
  {
    id: MOCK_LISTING_IDS.googleOne,
    service: {
      name: 'Google One',
      planName: '200 GB',
      logoUrl: null,
      brandColor: null,
      category: 'almacenamiento',
    },
    slotsOffered: 2,
    estimatedShareCents: 1100,
    estimatedShareLabel: 'estimada',
    billingDay: 3,
    owner: owner('Jorge Flores', 'En riesgo'),
    description: 'Almacenamiento compartido para fotos de la familia.',
    conditions: 'Cada persona usa su propia cuenta dentro del plan.',
    publishedAt: '2026-10-12T10:00:00.000Z',
    expiresAt: EXPIRES_AT,
    entryWindow: { isOpen: true, opensAt: null, closesAt: CLOSES_OCT_20 },
    myRequest: null,
    canRequest: true,
    cannotRequestReason: null,
  },
  {
    id: MOCK_LISTING_IDS.netflixStandard,
    service: {
      name: 'Netflix',
      planName: 'Estándar',
      logoUrl: null,
      brandColor: '#A4161A',
      category: 'video',
    },
    slotsOffered: 1,
    estimatedShareCents: 2100,
    estimatedShareLabel: 'estimada',
    billingDay: 5,
    owner: owner('Diego Huanca', 'Bueno'),
    description: 'Plan estándar con dos pantallas simultáneas.',
    conditions: 'Pago por transferencia el mismo día del corte.',
    publishedAt: '2026-10-17T16:20:00.000Z',
    expiresAt: EXPIRES_AT,
    entryWindow: { isOpen: true, opensAt: null, closesAt: CLOSES_OCT_20 },
    myRequest: null,
    canRequest: true,
    cannotRequestReason: null,
  },
  {
    id: MOCK_LISTING_IDS.activeRequest,
    service: {
      name: 'Apple TV+',
      planName: null,
      logoUrl: null,
      brandColor: null,
      category: 'video',
    },
    slotsOffered: 1,
    estimatedShareCents: 2450,
    estimatedShareLabel: 'estimada',
    billingDay: 22,
    owner: owner('Andrea Limachi', 'Bueno'),
    description: 'Ya enviaste una solicitud a este grupo; el titular la revisa.',
    conditions: null,
    publishedAt: '2026-10-18T11:00:00.000Z',
    expiresAt: EXPIRES_AT,
    entryWindow: { isOpen: true, opensAt: null, closesAt: CLOSES_OCT_21 },
    myRequest: { id: MOCK_ACTIVE_REQUEST_ID, status: 'abierta' },
    canRequest: false,
    cannotRequestReason: 'SOLICITUD_ACTIVA',
  },
  {
    id: MOCK_LISTING_IDS.maxFull,
    service: {
      name: 'Max',
      planName: 'Estándar',
      logoUrl: null,
      brandColor: '#4B2A8C',
      category: 'video',
    },
    slotsOffered: 0,
    estimatedShareCents: 1670,
    estimatedShareLabel: 'estimada',
    billingDay: 17,
    owner: owner('Diego Huanca', 'Bueno'),
    description: 'Todos los cupos ya están tomados.',
    conditions: null,
    publishedAt: '2026-10-10T10:00:00.000Z',
    expiresAt: EXPIRES_AT,
    entryWindow: { isOpen: true, opensAt: null, closesAt: CLOSES_OCT_20 },
    myRequest: null,
    canRequest: false,
    cannotRequestReason: 'SIN_CUPOS',
  },
];

const LEVEL_RANK: Record<RatingLevel, number> = {
  Excelente: 5,
  Bueno: 4,
  Regular: 3,
  'En riesgo': 2,
  Nuevo: 1,
};

/** Minúsculas y sin tildes, como el backend compara el texto (`q`). */
function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function parseCents(value: string | null): number | undefined {
  if (value === null || value === '') return undefined;
  const cents = Number(value);
  if (!Number.isSafeInteger(cents) || cents < 0) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Filtro de cuota inválido.');
  }
  return cents;
}

function parseLimit(value: string | null): number {
  if (value === null) return DEFAULT_LIMIT;
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw new ApiError(400, 'VALIDATION_ERROR', `El límite va de 1 a ${MAX_LIMIT}.`);
  }
  return limit;
}

function parseCursor(value: string | null): number {
  if (value === null) return 0;
  const offset = Number(value);
  if (!Number.isSafeInteger(offset) || offset < 0) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Cursor inválido.');
  }
  return offset;
}

function parseSort(value: string | null): ListingSort {
  if (value === null) return 'fecha';
  if (value === 'cuota' || value === 'fecha' || value === 'puntualidad') return value;
  throw new ApiError(400, 'VALIDATION_ERROR', 'Orden inválido.');
}

/** Ordena como lo haría el servidor. El orden por puntualidad desempata por fecha. */
function sortListings(items: ListingView[], sort: ListingSort): ListingView[] {
  const byDate = (a: ListingView, b: ListingView) => b.publishedAt.localeCompare(a.publishedAt);
  if (sort === 'cuota') {
    return [...items].sort((a, b) => a.estimatedShareCents - b.estimatedShareCents);
  }
  if (sort === 'puntualidad') {
    return [...items].sort(
      (a, b) => LEVEL_RANK[b.owner.level] - LEVEL_RANK[a.owner.level] || byDate(a, b),
    );
  }
  return [...items].sort(byDate);
}

/** Copia de la publicación, para que quien la recibe no altere el simulador. */
function copyOf(listing: ListingView): ListingView {
  return {
    ...listing,
    service: { ...listing.service },
    owner: { ...listing.owner },
    entryWindow: { ...listing.entryWindow },
  };
}

function search(params: URLSearchParams): ListingsPage {
  const q = params.get('q')?.trim();
  const category = params.get('category');
  const minShareCents = parseCents(params.get('minShareCents'));
  const maxShareCents = parseCents(params.get('maxShareCents'));
  const sort = parseSort(params.get('sort'));
  const limit = parseLimit(params.get('limit'));
  const offset = parseCursor(params.get('cursor'));

  const needle = q ? normalize(q) : '';
  const matches = LISTINGS.filter((item) => {
    if (item.slotsOffered === 0) return false;
    if (needle && !normalize(item.service.name).includes(needle)) return false;
    if (category && item.service.category !== category) return false;
    if (minShareCents !== undefined && item.estimatedShareCents < minShareCents) return false;
    if (maxShareCents !== undefined && item.estimatedShareCents > maxShareCents) return false;
    return true;
  });

  const sorted = sortListings(matches, sort);
  const next = offset + limit;
  return {
    items: sorted.slice(offset, next).map(copyOf),
    nextCursor: next < sorted.length ? String(next) : null,
  };
}

/**
 * `GET /listings`: recibe la query ya armada por el cliente (`buildListingsQuery`) y devuelve la
 * página, como haría el servidor.
 */
export function listListings(
  query: URLSearchParams,
  options: ListingRequestOptions = {},
): Promise<ListingsPage> {
  return delay(() => search(query), options.signal);
}

/** Largo máximo del mensaje de la solicitud (contrato 008). */
const REQUEST_MESSAGE_MAX = 200;

/** Regla del `422 BUSINESS_RULE` que corresponde a cada causa que ya entregó la API. */
const REFUSAL_RULE: Record<Exclude<ListingCannotRequestReason, 'CUENTA_RESTRINGIDA'>, string> = {
  VENTANA_CERRADA: 'ENTRY_WINDOW_CLOSED',
  SOLICITUD_ACTIVA: 'ACTIVE_REQUEST_EXISTS',
  DEMASIADAS_SOLICITUDES: 'TOO_MANY_ACTIVE_REQUESTS',
  COBROS_ABIERTOS: 'OPEN_CHARGES_IN_GROUP',
  SIN_CUPOS: 'NO_SLOTS_AVAILABLE',
};

/** Error de una publicación que no admite la solicitud, según la causa que ya tenía la API. */
function refusal(listing: ListingView): ApiError {
  const reason = listing.cannotRequestReason;
  if (reason === 'CUENTA_RESTRINGIDA') {
    return new ApiError(403, 'ACCOUNT_RESTRICTED', 'Tu cuenta está restringida.');
  }
  const code = reason ? REFUSAL_RULE[reason] : 'NO_SLOTS_AVAILABLE';
  return new ApiError(422, 'BUSINESS_RULE', 'No puedes pedir este cupo ahora.', {
    code,
    ...(code === 'ENTRY_WINDOW_CLOSED' ? { opensAt: listing.entryWindow.opensAt } : {}),
  });
}

/**
 * `POST /listings/:id/requests`: abre una solicitud de ingreso (spec 010) con el mensaje opcional.
 * Responde la solicitud `abierta`; el simulador no guarda el mensaje.
 */
export function requestListingSeat(
  listingId: string,
  input: ListingSeatInput,
  options: ListingRequestOptions = {},
): Promise<ListingSeatRequest> {
  return delay(() => {
    if (input.message !== undefined && input.message.length > REQUEST_MESSAGE_MAX) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'El mensaje admite hasta 200 caracteres.');
    }
    const found = LISTINGS.find((item) => item.id === listingId);
    if (!found) {
      throw new ApiError(404, 'LISTING_NOT_FOUND', 'Esta publicación ya no existe.');
    }
    // Error fijo: el cupo se ocupó entre que se vio la publicación y se envió la solicitud.
    if (found.id === MOCK_LISTING_IDS.googleOne) {
      throw new ApiError(422, 'BUSINESS_RULE', 'Ya no quedan cupos libres en esta publicación.', {
        code: 'NO_SLOTS_AVAILABLE',
      });
    }
    if (!found.canRequest) throw refusal(found);
    return { id: MOCK_NEW_REQUEST_ID };
  }, options.signal);
}

/** `GET /listings/:id`: `404 LISTING_NOT_FOUND` si no existe o no está disponible para ver. */
export function getListing(
  listingId: string,
  options: ListingRequestOptions = {},
): Promise<ListingView> {
  return delay(() => {
    const found = LISTINGS.find((item) => item.id === listingId);
    if (!found) {
      throw new ApiError(404, 'LISTING_NOT_FOUND', 'Esta publicación ya no existe.');
    }
    return copyOf(found);
  }, options.signal);
}
