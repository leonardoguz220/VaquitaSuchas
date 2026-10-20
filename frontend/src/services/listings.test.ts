import { apiRequest } from './http';
import {
  buildListingsQuery,
  getListing,
  listingReportPath,
  listingRequestPath,
  listListings,
  reportListing,
  requestListingSeat,
} from './listings';

jest.mock('./http', () => ({ apiRequest: jest.fn() }));

const mockedRequest = jest.mocked(apiRequest);
const LISTING_ID = '7a1f0c2e-0000-4000-8000-000000000001';

function lastCall() {
  const call = mockedRequest.mock.calls.at(-1);
  if (!call) throw new Error('apiRequest no se llamó');
  return { path: call[0], options: call[1] ?? {} };
}

describe('services/listings conectado al backend (contrato 008, T016 y T020)', () => {
  beforeEach(() => {
    mockedRequest.mockReset();
    mockedRequest.mockResolvedValue({} as never);
  });

  it('CA-008-06: sin filtros pide GET /api/listings sin query', async () => {
    await listListings();
    expect(lastCall().path).toBe('/api/listings');
  });

  it('CA-008-06: con filtros pide GET /api/listings con la query del contrato', async () => {
    await listListings({ q: 'netflix', sort: 'cuota', limit: 6 });
    expect(lastCall().path).toBe('/api/listings?q=netflix&sort=cuota&limit=6');
  });

  it('RF-008-07: el cursor de la página siguiente viaja en la query', () => {
    expect(buildListingsQuery({ cursor: '6' }).toString()).toBe('cursor=6');
  });

  it('CA-008-19: getListing pide GET /api/listings/:id con el id escapado', async () => {
    await getListing(LISTING_ID);
    expect(lastCall()).toEqual({
      path: `/api/listings/${LISTING_ID}`,
      options: { signal: undefined },
    });
  });

  it('CA-008-08: requestListingSeat envía POST con el mensaje', async () => {
    mockedRequest.mockResolvedValueOnce({ id: 'jr-1' } as never);
    await expect(requestListingSeat(LISTING_ID, { message: 'Hola' })).resolves.toEqual({
      id: 'jr-1',
    });
    expect(lastCall()).toEqual({
      path: listingRequestPath(LISTING_ID),
      options: { method: 'POST', body: { message: 'Hola' }, signal: undefined },
    });
  });

  it('CA-008-08: sin mensaje envía un cuerpo vacío', async () => {
    await requestListingSeat(LISTING_ID, {});
    expect(lastCall().options).toEqual({ method: 'POST', body: {}, signal: undefined });
  });

  it('RF-008-17: reportListing envía POST con el motivo y el comentario', async () => {
    const input = { reason: 'spam' as const, comment: 'Publica dos veces.' };
    await reportListing(LISTING_ID, input);
    expect(lastCall()).toEqual({
      path: listingReportPath(LISTING_ID),
      options: { method: 'POST', body: input, signal: undefined },
    });
  });
});
