import { apiRequest } from './http';
import { getAdminStats } from './admin-stats';

jest.mock('./http', () => ({
  ...jest.requireActual('./http'),
  apiRequest: jest.fn(),
}));

describe('services/admin-stats (contrato 009 § Estadísticas)', () => {
  it('RF-009-15: getAdminStats hace GET /api/admin/stats', async () => {
    jest.mocked(apiRequest).mockResolvedValue({});
    await getAdminStats();
    expect(apiRequest).toHaveBeenCalledWith('/api/admin/stats');
  });
});
