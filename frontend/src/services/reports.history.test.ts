/**
 * Cliente real de calendario, historial y exportaciones (spec 006, `contracts/api.md`). Se prueba
 * con `fetch` simulado: la URL que sale por el proxy `/api`, el nombre de archivo que da el
 * servidor y los errores A.2 como `ApiError`.
 */
import {
  exportGroupHistoryCsv,
  exportHistoryCsv,
  getCalendar,
  getUpcomingEvents,
  listHistory,
  type CalendarResponse,
  type HistoryPage,
} from './reports';
import { ApiError } from './http';

const GROUP_ID = '6f1c2a3e-0000-4000-8000-000000000002';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

/** Respuesta CSV con el `Content-Disposition` que pone el servidor. */
function csvResponse(filename: string | null): Response {
  return {
    ok: true,
    status: 200,
    blob: async () => new Blob(['periodo,servicio\n'], { type: 'text/csv' }),
    headers: {
      get: (name: string) =>
        name.toLowerCase() === 'content-disposition' && filename
          ? `attachment; filename="${filename}"`
          : null,
    },
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

describe('services/reports: calendario conectado (contrato 006)', () => {
  it('RF-006-11: getCalendar pide el mes elegido', async () => {
    const calendar = { month: '2026-11', events: [] } as CalendarResponse;
    fetchMock.mockResolvedValueOnce(jsonResponse(200, calendar));

    await expect(getCalendar('2026-11')).resolves.toEqual(calendar);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/me/calendar?month=2026-11');
  });

  it('CA-006-13: getCalendar sin mes pide el actual; un mes inválido da 400', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { events: [] }));
    await getCalendar();
    expect(fetchMock.mock.calls[0][0]).toBe('/api/me/calendar');

    fetchMock.mockResolvedValueOnce(
      jsonResponse(400, { statusCode: 400, code: 'VALIDATION_ERROR', message: 'Mes inválido' }),
    );
    const error = await getCalendar('2026-13').catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ statusCode: 400 });
  });

  it('RF-006-12: getUpcomingEvents pide 30 días por defecto', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { events: [] }));

    await getUpcomingEvents();
    expect(fetchMock.mock.calls[0][0]).toBe('/api/me/calendar/upcoming?days=30');
  });
});

describe('services/reports: historial conectado (contrato 006)', () => {
  it('RF-006-13: listHistory manda mes, suscripción, estado, límite y cursor', async () => {
    const page: HistoryPage = { items: [], nextCursor: null };
    fetchMock.mockResolvedValueOnce(jsonResponse(200, page));

    await expect(
      listHistory({
        period: '2026-10',
        groupId: GROUP_ID,
        status: 'atrasado',
        limit: 25,
        cursor: 'c1',
      }),
    ).resolves.toEqual(page);
    expect(fetchMock.mock.calls[0][0]).toBe(
      `/api/me/history?period=2026-10&groupId=${GROUP_ID}&status=atrasado&limit=25&cursor=c1`,
    );
  });

  it('RF-006-13: listHistory sin filtros pide solo la ruta', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { items: [], nextCursor: null }));

    await listHistory();
    expect(fetchMock.mock.calls[0][0]).toBe('/api/me/history');
  });
});

describe('services/reports: exportaciones CSV (contrato 006)', () => {
  it('RF-006-14: exportHistoryCsv guarda el archivo con el nombre que da el servidor', async () => {
    fetchMock.mockResolvedValueOnce(csvResponse('vaquita-historial-2026-10-20.csv'));

    const file = await exportHistoryCsv({ period: '2026-10' });
    expect(fetchMock.mock.calls[0][0]).toBe('/api/me/history/export.csv?period=2026-10');
    expect(file.filename).toBe('vaquita-historial-2026-10-20.csv');
    expect(file.blob.type).toContain('text/csv');
  });

  it('RF-006-14: sin nombre en la cabecera, el archivo llega con filename null', async () => {
    fetchMock.mockResolvedValueOnce(csvResponse(null));

    await expect(exportHistoryCsv()).resolves.toMatchObject({ filename: null });
  });

  it('RF-006-15: 429 RATE_LIMITED llega con la espera en details', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(429, {
        statusCode: 429,
        code: 'RATE_LIMITED',
        message: 'Espera un rato',
        details: { retryAfterSeconds: 120 },
      }),
    );

    const error = await exportHistoryCsv().catch((caught: unknown) => caught);
    expect(error).toMatchObject({ statusCode: 429, code: 'RATE_LIMITED' });
    expect((error as ApiError).details).toMatchObject({ retryAfterSeconds: 120 });
  });

  it('CA-006-17: exportGroupHistoryCsv manda el miembro elegido por el titular', async () => {
    fetchMock.mockResolvedValueOnce(csvResponse('vaquita-historial-grupo-2026-10-20.csv'));
    const userId = '6f1c2a3e-0000-4000-8000-0000000000aa';

    await exportGroupHistoryCsv(GROUP_ID, { period: '2026-10', userId, status: 'pagado' });
    expect(fetchMock.mock.calls[0][0]).toBe(
      `/api/groups/${GROUP_ID}/history/export.csv?period=2026-10&userId=${userId}&status=pagado`,
    );
  });

  it('CA-006-17: exportGroupHistoryCsv pide el grupo y responde 403 a un miembro', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(403, { statusCode: 403, code: 'FORBIDDEN', message: 'Sin permiso' }),
    );

    const error = await exportGroupHistoryCsv(GROUP_ID, { period: '2026-10' }).catch(
      (caught: unknown) => caught,
    );
    expect(fetchMock.mock.calls[0][0]).toBe(
      `/api/groups/${GROUP_ID}/history/export.csv?period=2026-10`,
    );
    expect(error).toMatchObject({ statusCode: 403 });
  });
});
