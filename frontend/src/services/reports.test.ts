import { apiRequest } from './http';
import { getDashboard, listDashboard } from './reports';

jest.mock('./http', () => ({
  ...jest.requireActual('./http'),
  apiRequest: jest.fn(),
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
