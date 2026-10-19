import { openRequest } from './__fixtures__/join-requests';
import { apiRequest } from './http';
import { listJoinRequests, openJoinRequest } from './join-requests';

jest.mock('./http', () => ({
  ...jest.requireActual('./http'),
  apiRequest: jest.fn(),
}));

const mockedRequest = jest.mocked(apiRequest);

beforeEach(() => mockedRequest.mockReset());

describe('services/join-requests (contrato 010): solicitud', () => {
  it('CA-010-01: openJoinRequest hace POST /api/join-requests con el código', async () => {
    mockedRequest.mockResolvedValue(openRequest);
    await expect(openJoinRequest('K7M2Q9XA')).resolves.toBe(openRequest);
    expect(mockedRequest).toHaveBeenCalledWith('/api/join-requests', {
      method: 'POST',
      body: { code: 'K7M2Q9XA' },
    });
  });

  it('RF-010-26: listJoinRequests sin filtros hace GET /api/join-requests', async () => {
    const page = { items: [], nextCursor: null };
    mockedRequest.mockResolvedValue(page);
    await expect(listJoinRequests()).resolves.toBe(page);
    expect(mockedRequest).toHaveBeenCalledWith('/api/join-requests');
  });

  it('RF-010-26: listJoinRequests manda rol, estados, grupo, límite y cursor en la query', async () => {
    mockedRequest.mockResolvedValue({ items: [], nextCursor: null });
    await listJoinRequests({
      role: 'solicitante',
      status: ['abierta', 'esperando_pago'],
      groupId: 'g7',
      limit: 20,
      cursor: 'abc',
    });
    expect(mockedRequest).toHaveBeenCalledWith(
      '/api/join-requests?role=solicitante&status=abierta%2Cesperando_pago&groupId=g7&limit=20&cursor=abc',
    );
  });
});
