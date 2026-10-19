import { apiRequest } from './http';
import {
  banAdminUser,
  changeAdminUserRole,
  getAdminUser,
  listAdminUsers,
  reactivateAdminUser,
  revokeAdminBan,
  suspendAdminUser,
} from './admin-users';

jest.mock('./http', () => ({
  ...jest.requireActual('./http'),
  apiRequest: jest.fn(),
}));

const mockedRequest = jest.mocked(apiRequest);

beforeEach(() => {
  mockedRequest.mockReset();
  mockedRequest.mockResolvedValue({});
});

describe('services/admin-users (contrato 009 § Usuarios)', () => {
  it('RF-009-08: listAdminUsers hace GET /api/admin/users sin query por defecto', async () => {
    await listAdminUsers();
    expect(mockedRequest).toHaveBeenCalledWith('/api/admin/users');
  });

  it('CA-009-07: listAdminUsers manda búsqueda, estado, rol, límite y cursor', async () => {
    await listAdminUsers({
      q: 'camila',
      status: 'suspendido',
      role: 'admin',
      limit: 20,
      cursor: 'c2',
    });
    expect(mockedRequest).toHaveBeenCalledWith(
      '/api/admin/users?q=camila&status=suspendido&role=admin&limit=20&cursor=c2',
    );
  });

  it('RF-009-09: getAdminUser hace GET con el id codificado', async () => {
    await getAdminUser('u/1');
    expect(mockedRequest).toHaveBeenCalledWith('/api/admin/users/u%2F1');
  });

  it('RF-009-10: suspendAdminUser y reactivateAdminUser hacen POST con el motivo', async () => {
    await suspendAdminUser('u1', { reason: 'Motivo suficiente' });
    expect(mockedRequest).toHaveBeenCalledWith('/api/admin/users/u1/suspend', {
      method: 'POST',
      body: { reason: 'Motivo suficiente' },
    });
    await reactivateAdminUser('u1', { reason: 'Apelación aceptada' });
    expect(mockedRequest).toHaveBeenLastCalledWith('/api/admin/users/u1/reactivate', {
      method: 'POST',
      body: { reason: 'Apelación aceptada' },
    });
  });

  it('RF-009-19: banAdminUser hace POST /ban con el motivo', async () => {
    await banAdminUser('u1', { reason: 'Estafa comprobada' });
    expect(mockedRequest).toHaveBeenCalledWith('/api/admin/users/u1/ban', {
      method: 'POST',
      body: { reason: 'Estafa comprobada' },
    });
  });

  it('CA-009-34: revokeAdminBan hace POST /api/admin/bans/:banId/revoke', async () => {
    await revokeAdminBan('b/1', { reason: 'Revisión del caso' });
    expect(mockedRequest).toHaveBeenCalledWith('/api/admin/bans/b%2F1/revoke', {
      method: 'POST',
      body: { reason: 'Revisión del caso' },
    });
  });

  it('RF-009-03: changeAdminUserRole hace POST /role con rol y motivo', async () => {
    await changeAdminUserRole('u1', { role: 'admin', reason: 'Se suma al equipo' });
    expect(mockedRequest).toHaveBeenCalledWith('/api/admin/users/u1/role', {
      method: 'POST',
      body: { role: 'admin', reason: 'Se suma al equipo' },
    });
  });
});
