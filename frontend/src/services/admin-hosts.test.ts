import { apiRequest } from './http';
import {
  enableHost,
  listHostEnablements,
  revokeHostEnablement,
  transferGroupOwnership,
} from './admin-hosts';

jest.mock('./http', () => ({
  ...jest.requireActual('./http'),
  apiRequest: jest.fn(),
}));

const mockedRequest = jest.mocked(apiRequest);

beforeEach(() => {
  mockedRequest.mockReset();
  mockedRequest.mockResolvedValue({});
});

describe('services/admin-hosts (contrato 009 § Titulares habilitados)', () => {
  it('RF-009-21: listHostEnablements pide solo las vigentes, con límite y cursor', async () => {
    await listHostEnablements();
    expect(mockedRequest).toHaveBeenCalledWith('/api/admin/host-enablements?active=true');
    await listHostEnablements({ limit: 20, cursor: 'c2' });
    expect(mockedRequest).toHaveBeenLastCalledWith(
      '/api/admin/host-enablements?active=true&limit=20&cursor=c2',
    );
  });

  it('CA-009-28: enableHost hace POST /admin/users/:id/host-enablement con el motivo', async () => {
    await enableHost('u/1', { reason: 'Titular de prueba para la demo' });
    expect(mockedRequest).toHaveBeenCalledWith('/api/admin/users/u%2F1/host-enablement', {
      method: 'POST',
      body: { reason: 'Titular de prueba para la demo' },
    });
  });

  it('RF-009-21: revokeHostEnablement hace POST …/host-enablement/revoke', async () => {
    await revokeHostEnablement('u1', { reason: 'Ya alcanzó la calificación' });
    expect(mockedRequest).toHaveBeenCalledWith('/api/admin/users/u1/host-enablement/revoke', {
      method: 'POST',
      body: { reason: 'Ya alcanzó la calificación' },
    });
  });

  it('CA-009-35: transferGroupOwnership hace POST con el destinatario y el motivo', async () => {
    await transferGroupOwnership('g/1', { toUserId: 'u2', reason: 'Pedido de los miembros' });
    expect(mockedRequest).toHaveBeenCalledWith('/api/admin/groups/g%2F1/transfer-ownership', {
      method: 'POST',
      body: { toUserId: 'u2', reason: 'Pedido de los miembros' },
    });
  });
});
