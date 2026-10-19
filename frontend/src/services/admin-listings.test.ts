import { apiRequest } from './http';
import { listReportedListings, moderateListing } from './admin-listings';

jest.mock('./http', () => ({
  ...jest.requireActual('./http'),
  apiRequest: jest.fn(),
}));

const mockedRequest = jest.mocked(apiRequest);

beforeEach(() => {
  mockedRequest.mockReset();
  mockedRequest.mockResolvedValue({});
});

describe('services/admin-listings (contrato 009 § Moderación de cupos)', () => {
  it('RF-009-12: listReportedListings hace GET /api/admin/listings/reports con límite y cursor', async () => {
    await listReportedListings();
    expect(mockedRequest).toHaveBeenCalledWith('/api/admin/listings/reports');
    await listReportedListings({ limit: 20, cursor: 'c2' });
    expect(mockedRequest).toHaveBeenLastCalledWith(
      '/api/admin/listings/reports?limit=20&cursor=c2',
    );
  });

  it('CA-009-14: restaurar hace POST …/restore con el motivo', async () => {
    await moderateListing('l/1', 'restore', { reason: 'Los reportes no se sostienen' });
    expect(mockedRequest).toHaveBeenCalledWith('/api/admin/listings/l%2F1/restore', {
      method: 'POST',
      body: { reason: 'Los reportes no se sostienen' },
    });
  });

  it('CA-009-15: eliminar y eliminar y suspender hacen POST con el motivo', async () => {
    await moderateListing('l1', 'delete', { reason: 'Pide pagar fuera de la app' });
    expect(mockedRequest).toHaveBeenCalledWith('/api/admin/listings/l1/delete', {
      method: 'POST',
      body: { reason: 'Pide pagar fuera de la app' },
    });
    await moderateListing('l1', 'delete-and-suspend', { reason: 'Estafa reiterada en cupos' });
    expect(mockedRequest).toHaveBeenLastCalledWith('/api/admin/listings/l1/delete-and-suspend', {
      method: 'POST',
      body: { reason: 'Estafa reiterada en cupos' },
    });
  });
});
