import { apiDownload, apiRequest } from './http';
import {
  exportGroupHistoryCsv,
  exportHistoryCsv,
  listHistory,
  getCalendar,
  getDashboard,
  getDashboardCharts,
  getGroupCollection,
  getUpcomingEvents,
  listDashboard,
} from './reports';

jest.mock('./http', () => ({
  ...jest.requireActual('./http'),
  apiRequest: jest.fn(),
  apiDownload: jest.fn(),
}));

const mockedRequest = jest.mocked(apiRequest);

beforeEach(() => mockedRequest.mockReset());

describe('services/reports (contrato 006): panel', () => {
  it('RF-006-01: getDashboard hace GET /api/me/dashboard sin query por defecto', async () => {
    mockedRequest.mockResolvedValue({});
    await getDashboard();
    expect(mockedRequest).toHaveBeenCalledWith('/api/me/dashboard');
  });

  it('RF-006-01: getDashboard manda el mes y la suscripción', async () => {
    mockedRequest.mockResolvedValue({});
    await getDashboard({ month: '2026-09', groupId: 'g/2' });
    expect(mockedRequest).toHaveBeenCalledWith('/api/me/dashboard?month=2026-09&groupId=g%2F2');
  });

  it('RF-006-04: listDashboard pide la lista con su nombre, grupo, límite y cursor', async () => {
    mockedRequest.mockResolvedValue({ items: [], nextCursor: null });
    await listDashboard({ list: 'debts' });
    expect(mockedRequest).toHaveBeenLastCalledWith('/api/me/dashboard/lists?list=debts');
    await listDashboard({ list: 'owed', groupId: 'g1', limit: 10, cursor: 'k' });
    expect(mockedRequest).toHaveBeenLastCalledWith(
      '/api/me/dashboard/lists?list=owed&groupId=g1&limit=10&cursor=k',
    );
  });
});

describe('services/reports (contrato 006): cobranza del grupo', () => {
  it('RF-006-06: getGroupCollection hace GET /api/groups/:id/collection con el período', async () => {
    mockedRequest.mockResolvedValue({});
    await getGroupCollection('g/1');
    expect(mockedRequest).toHaveBeenLastCalledWith('/api/groups/g%2F1/collection');
    await getGroupCollection('g1', '2026-09');
    expect(mockedRequest).toHaveBeenLastCalledWith('/api/groups/g1/collection?period=2026-09');
  });
});

describe('services/reports (contrato 006): gráficos', () => {
  it('RF-006-07: getDashboardCharts hace GET /api/me/dashboard/charts con mes y suscripción', async () => {
    mockedRequest.mockResolvedValue({});
    await getDashboardCharts();
    expect(mockedRequest).toHaveBeenLastCalledWith('/api/me/dashboard/charts');
    await getDashboardCharts({ month: '2026-10', groupId: 'g1' });
    expect(mockedRequest).toHaveBeenLastCalledWith(
      '/api/me/dashboard/charts?month=2026-10&groupId=g1',
    );
  });
});

describe('services/reports (contrato 006): calendario', () => {
  it('RF-006-11: getCalendar hace GET /api/me/calendar con el mes', async () => {
    mockedRequest.mockResolvedValue({ events: [] });
    await getCalendar();
    expect(mockedRequest).toHaveBeenLastCalledWith('/api/me/calendar');
    await getCalendar('2027-02');
    expect(mockedRequest).toHaveBeenLastCalledWith('/api/me/calendar?month=2027-02');
  });

  it('RF-006-11: getUpcomingEvents pide los próximos 30 días por defecto', async () => {
    mockedRequest.mockResolvedValue({ events: [] });
    await getUpcomingEvents();
    expect(mockedRequest).toHaveBeenLastCalledWith('/api/me/calendar/upcoming?days=30');
    await getUpcomingEvents(7);
    expect(mockedRequest).toHaveBeenLastCalledWith('/api/me/calendar/upcoming?days=7');
  });
});

describe('services/reports (contrato 006): historial y exportación', () => {
  const mockedDownload = jest.mocked(apiDownload);
  beforeEach(() => mockedDownload.mockReset());

  it('RF-006-13: listHistory hace GET /api/me/history con filtros, límite y cursor', async () => {
    mockedRequest.mockResolvedValue({ items: [], nextCursor: null });
    await listHistory();
    expect(mockedRequest).toHaveBeenLastCalledWith('/api/me/history');
    await listHistory({
      period: '2026-09',
      groupId: 'g2',
      status: 'pagado',
      limit: 25,
      cursor: 'k',
    });
    expect(mockedRequest).toHaveBeenLastCalledWith(
      '/api/me/history?period=2026-09&groupId=g2&status=pagado&limit=25&cursor=k',
    );
  });

  it('RF-006-14: exportHistoryCsv descarga /api/me/history/export.csv con los filtros', async () => {
    const file = { blob: new Blob(['x']), filename: 'a.csv' };
    mockedDownload.mockResolvedValue(file);
    await expect(exportHistoryCsv()).resolves.toBe(file);
    expect(mockedDownload).toHaveBeenLastCalledWith('/api/me/history/export.csv');
    await exportHistoryCsv({ period: '2026-10', status: 'atrasado' });
    expect(mockedDownload).toHaveBeenLastCalledWith(
      '/api/me/history/export.csv?period=2026-10&status=atrasado',
    );
  });

  it('CA-006-17: exportGroupHistoryCsv descarga el CSV del grupo con período y miembro', async () => {
    mockedDownload.mockResolvedValue({ blob: new Blob(['x']), filename: null });
    await exportGroupHistoryCsv('g/1', { period: '2026-10', userId: 'u5' });
    expect(mockedDownload).toHaveBeenLastCalledWith(
      '/api/groups/g%2F1/history/export.csv?period=2026-10&userId=u5',
    );
  });
});
