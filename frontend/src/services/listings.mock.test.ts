import { ApiError } from './http';
import { buildListingsQuery, listingRequestPath, type ListingsPage } from './listings';
import * as mock from './listings.mock';
import {
  MOCK_ACTIVE_REQUEST_ID,
  MOCK_LISTING_IDS,
  MOCK_MISSING_LISTING_ID,
  MOCK_NEW_REQUEST_ID,
} from './listings.mock';

/** Simuladores de los endpoints, con la misma firma que usa el cliente (`listings.ts`). */
const listListings = (params: Parameters<typeof buildListingsQuery>[0] = {}) =>
  mock.listListings(buildListingsQuery(params), {});
const getListing = (id: string) => mock.getListing(id, {});
const requestListingSeat = (id: string, input: { message?: string }) =>
  mock.requestListingSeat(id, input, {});

/** Espera la latencia simulada y devuelve el resultado, sin que un rechazo quede sin manejar. */
async function settle<T>(
  promise: Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false; error: unknown }> {
  const outcome = promise.then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  );
  await jest.advanceTimersByTimeAsync(400);
  return outcome;
}

async function search(params: Parameters<typeof listListings>[0] = {}): Promise<ListingsPage> {
  const outcome = await settle(listListings(params));
  if (!outcome.ok) throw outcome.error;
  return outcome.value;
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('buildListingsQuery (RF-008-09, CA-008-06)', () => {
  it('CA-008-06: arma la query con los nombres del contrato y omite lo vacío', () => {
    const query = buildListingsQuery({
      q: '  Netflix ',
      category: 'video',
      minShareCents: 1500,
      maxShareCents: null,
      sort: 'puntualidad',
      limit: 6,
      cursor: '6',
    });
    expect(query.toString()).toBe(
      'q=Netflix&category=video&minShareCents=1500&sort=puntualidad&limit=6&cursor=6',
    );
  });

  it('RF-008-09: sin filtros la búsqueda va sin parámetros', () => {
    expect(buildListingsQuery({ q: '   ', maxShareCents: null }).toString()).toBe('');
  });
});

describe('simulador: listListings y getListing (RF-008-07, RF-008-09)', () => {
  it('CA-008-06: el filtro por «netflix» (sin mayúsculas) devuelve solo publicaciones de Netflix', async () => {
    const page = await search({ q: 'netflix' });
    expect(page.items.length).toBeGreaterThan(0);
    expect(page.items.every((item) => item.service.name === 'Netflix')).toBe(true);
  });

  it('RF-008-07: una publicación llena no aparece en la búsqueda', async () => {
    const page = await search({ q: 'Max' });
    expect(page.items).toEqual([]);
  });

  it('RF-008-07: la lista se pagina con el cursor; la última página no trae cursor', async () => {
    const first = await search({ limit: 6 });
    expect(first.items).toHaveLength(6);
    expect(first.nextCursor).toBe('6');
    const last = await search({ limit: 6, cursor: first.nextCursor ?? undefined });
    expect(last.items).toHaveLength(3);
    expect(last.nextCursor).toBeNull();
  });

  it('RF-008-09: el orden por cuota va de menor a mayor', async () => {
    const page = await search({ sort: 'cuota', limit: 50 });
    const cents = page.items.map((item) => item.estimatedShareCents);
    expect(cents).toEqual([...cents].sort((a, b) => a - b));
    expect(cents[0]).toBe(930);
  });

  it('RF-008-09: el orden por puntualidad pone primero al titular de mejor nivel y desempata por fecha', async () => {
    const page = await search({ sort: 'puntualidad', limit: 50 });
    expect(page.items[0].id).toBe(MOCK_LISTING_IDS.youtubePremium);
    expect(page.items[0].owner.level).toBe('Excelente');
  });

  it('RF-008-09: el rango de cuota incluye solo montos dentro de los límites', async () => {
    const page = await search({ minShareCents: 1500, maxShareCents: 2500, limit: 50 });
    expect(page.items.length).toBeGreaterThan(0);
    for (const item of page.items) {
      expect(item.estimatedShareCents).toBeGreaterThanOrEqual(1500);
      expect(item.estimatedShareCents).toBeLessThanOrEqual(2500);
    }
  });

  it('RN-008-07: la cuota llega fija y rotulada «estimada», sin recalcularla', async () => {
    const outcome = await settle(getListing(MOCK_LISTING_IDS.primeVideo));
    if (!outcome.ok) throw outcome.error;
    expect(outcome.value.estimatedShareCents).toBe(930);
    expect(outcome.value.estimatedShareLabel).toBe('estimada');
  });

  it('RF-008-07: un id inexistente responde 404 LISTING_NOT_FOUND', async () => {
    const outcome = await settle(getListing(MOCK_MISSING_LISTING_ID));
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error).toBeInstanceOf(ApiError);
    expect(outcome.error).toMatchObject({ statusCode: 404, code: 'LISTING_NOT_FOUND' });
  });

  it('RF-008-07: el límite fuera de 1 a 50 responde 400', async () => {
    const outcome = await settle(listListings({ limit: 0 }));
    expect(outcome.ok).toBe(false);
  });
});

describe('listingRequestPath y requestListingSeat (RF-008-10, CA-008-08 a 10, 23)', () => {
  it('RF-008-10: la ruta del contrato es POST /api/listings/:id/requests con el id escapado', () => {
    expect(listingRequestPath('a b/c')).toBe('/api/listings/a%20b%2Fc/requests');
  });

  it('CA-008-08: acepta un mensaje de 200 caracteres y responde la solicitud abierta con su id', async () => {
    const outcome = await settle(
      requestListingSeat(MOCK_LISTING_IDS.primeVideo, { message: 'a'.repeat(200) }),
    );
    expect(outcome).toEqual({ ok: true, value: { id: MOCK_NEW_REQUEST_ID } });
  });

  it('CA-008-08: un mensaje de 250 caracteres responde 400 VALIDATION_ERROR', async () => {
    const outcome = await settle(
      requestListingSeat(MOCK_LISTING_IDS.primeVideo, { message: 'a'.repeat(250) }),
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error).toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' });
  });

  it('RF-008-10: el mensaje es opcional; sin mensaje también se abre la solicitud', async () => {
    const outcome = await settle(requestListingSeat(MOCK_LISTING_IDS.primeVideo, {}));
    expect(outcome).toEqual({ ok: true, value: { id: MOCK_NEW_REQUEST_ID } });
  });

  it('CA-008-23: con solicitud activa responde 422 BUSINESS_RULE con details.code ACTIVE_REQUEST_EXISTS', async () => {
    const outcome = await settle(requestListingSeat(MOCK_LISTING_IDS.activeRequest, {}));
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error).toBeInstanceOf(ApiError);
    expect(outcome.error).toMatchObject({
      statusCode: 422,
      code: 'BUSINESS_RULE',
      details: { code: 'ACTIVE_REQUEST_EXISTS' },
    });
  });

  it('CA-008-23: con la ventana cerrada responde ENTRY_WINDOW_CLOSED con details.opensAt', async () => {
    const outcome = await settle(requestListingSeat(MOCK_LISTING_IDS.youtubePremium, {}));
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error).toMatchObject({
      statusCode: 422,
      details: { code: 'ENTRY_WINDOW_CLOSED', opensAt: '2026-11-01T04:00:00.000Z' },
    });
  });

  it('CA-008-23: el cupo ocupado entre la vista y el envío responde 422 NO_SLOTS_AVAILABLE', async () => {
    const outcome = await settle(requestListingSeat(MOCK_LISTING_IDS.googleOne, {}));
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error).toMatchObject({
      statusCode: 422,
      code: 'BUSINESS_RULE',
      details: { code: 'NO_SLOTS_AVAILABLE' },
    });
  });

  it('CA-008-23: un id inexistente responde 404 LISTING_NOT_FOUND', async () => {
    const outcome = await settle(requestListingSeat(MOCK_MISSING_LISTING_ID, {}));
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error).toMatchObject({ statusCode: 404, code: 'LISTING_NOT_FOUND' });
  });

  it('CA-008-23: el simulador conoce la solicitud activa propia (MOCK_ACTIVE_REQUEST_ID)', async () => {
    const outcome = await settle(getListing(MOCK_LISTING_IDS.activeRequest));
    if (!outcome.ok) throw outcome.error;
    expect(outcome.value.myRequest).toEqual({ id: MOCK_ACTIVE_REQUEST_ID, status: 'abierta' });
  });
});
