/**
 * Cliente real del panel (spec 006, `contracts/api.md`): `getDashboard`, `listDashboard`,
 * `getGroupCollection` y `getDashboardCharts`. Se prueba con `fetch` simulado: la URL que sale por
 * el proxy `/api` y que los errores A.2 llegan como `ApiError`.
 */
import {
  getDashboard,
  getDashboardCharts,
  getGroupCollection,
  listDashboard,
  type DashboardCharts,
  type DashboardSummary,
  type GroupCollection,
} from './reports';
import { ApiError } from './http';

const GROUP_ID = '6f1c2a3e-0000-4000-8000-000000000001';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

const originalFetch = global.fetch;
const fetchMock = jest.fn<Promise<Response>, [string, RequestInit?]>();

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe('services/reports: panel conectado (contrato 006)', () => {
  it('RF-006-01: getDashboard sin filtros pide /api/me/dashboard y devuelve el cuerpo tal cual', async () => {
    const summary = { month: '2026-10', isEmpty: false } as unknown as DashboardSummary;
    fetchMock.mockResolvedValueOnce(jsonResponse(200, summary));

    await expect(getDashboard()).resolves.toEqual(summary);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/me/dashboard');
    expect(fetchMock.mock.calls[0][1]?.method).toBe('GET');
  });

  it('RF-006-01: getDashboard manda el mes y la suscripción elegidos como query', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { month: '2026-09' }));

    await getDashboard({ month: '2026-09', groupId: GROUP_ID });
    expect(fetchMock.mock.calls[0][0]).toBe(`/api/me/dashboard?month=2026-09&groupId=${GROUP_ID}`);
  });

  it('CA-006-18: getDashboard propaga el 404 de un grupo ajeno como ApiError', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(404, { statusCode: 404, code: 'NOT_FOUND', message: 'No encontrado' }),
    );

    const error = await getDashboard({ groupId: GROUP_ID }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
  });

  it('RF-006-04, RF-006-05: listDashboard pide la lista con límite y cursor', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { items: [], nextCursor: null }));

    await listDashboard({ list: 'debts', limit: 10, cursor: 'abc' });
    expect(fetchMock.mock.calls[0][0]).toBe(
      '/api/me/dashboard/lists?list=debts&limit=10&cursor=abc',
    );
  });

  it('RF-006-05: listDashboard de «Me deben» sin ser titular responde 403 como ApiError', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(403, { statusCode: 403, code: 'FORBIDDEN', message: 'Sin permiso' }),
    );

    await expect(listDashboard({ list: 'owed' })).rejects.toMatchObject({ statusCode: 403 });
  });

  it('RF-006-06: getGroupCollection codifica el id y pide el período', async () => {
    const collection = { period: '2026-09' } as unknown as GroupCollection;
    fetchMock.mockResolvedValueOnce(jsonResponse(200, collection));

    await expect(getGroupCollection(GROUP_ID, '2026-09')).resolves.toEqual(collection);
    expect(fetchMock.mock.calls[0][0]).toBe(`/api/groups/${GROUP_ID}/collection?period=2026-09`);
  });

  it('CA-006-08: getGroupCollection a un miembro responde 403', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(403, { statusCode: 403, code: 'FORBIDDEN', message: 'Sin permiso' }),
    );

    await expect(getGroupCollection(GROUP_ID)).rejects.toMatchObject({ statusCode: 403 });
    expect(fetchMock.mock.calls[0][0]).toBe(`/api/groups/${GROUP_ID}/collection`);
  });

  it('RF-006-07: getDashboardCharts pide las series del mes y de la suscripción', async () => {
    const charts = { monthly: [], byService: [], savings: [] } as DashboardCharts;
    fetchMock.mockResolvedValueOnce(jsonResponse(200, charts));

    await expect(getDashboardCharts({ month: '2026-10' })).resolves.toEqual(charts);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/me/dashboard/charts?month=2026-10');
  });
});
