import {
  banAdminUser,
  getAdminUser,
  listAdminUsers,
  reactivateAdminUser,
  revokeAdminBan,
  setAdminUserRole,
  suspendAdminUser,
} from './admin';
import { apiRequest } from './http';

jest.mock('./http', () => ({ apiRequest: jest.fn() }));

const mockedRequest = jest.mocked(apiRequest);
const USER_ID = '6b1d3f0e-0000-4000-8000-0000000000u1';
const BAN_ID = '6b1d3f0e-0000-4000-8000-0000000000b1';
const REASON = 'Motivo suficientemente largo para la prueba.';

function lastCall() {
  const call = mockedRequest.mock.calls.at(-1);
  if (!call) throw new Error('apiRequest no se llamó');
  return { path: call[0], options: call[1] ?? {} };
}

/** Ficha con la forma que devuelve el backend (`AdminUserView`). */
function apiView(overrides: Record<string, unknown> = {}) {
  return {
    id: USER_ID,
    fullName: 'Raúl Flores',
    email: 'raul@dev.vaquita',
    phone: '+59177001122',
    ciMasked: '*****123',
    role: 'usuario',
    status: 'activo',
    createdAt: '2026-07-01T12:00:00Z',
    lastLoginAt: null,
    groupsAsHost: 1,
    groupsAsMember: 2,
    reputation: { level: null, stars: null, consideredCharges: 0 },
    reportsReceived: 0,
    ban: null,
    suspension: null,
    hostEnablement: null,
    ...overrides,
  };
}

describe('services/admin conectado al backend (spec 009): usuarios y baneos', () => {
  beforeEach(() => {
    mockedRequest.mockReset();
    mockedRequest.mockResolvedValue(apiView() as never);
  });

  it('CA-009-07: listAdminUsers manda filtros, límite y cursor a GET /admin/users', async () => {
    await listAdminUsers({ q: 'raul', status: 'baneado', role: 'admin', limit: 20, cursor: 'c1' });
    expect(lastCall().path).toBe(
      '/api/admin/users?q=raul&status=baneado&role=admin&limit=20&cursor=c1',
    );
  });

  it('CA-009-07: listAdminUsers sin filtros no añade query', async () => {
    await listAdminUsers();
    expect(lastCall().path).toBe('/api/admin/users');
  });

  it('CA-009-08: getAdminUser solo recibe la cédula enmascarada', async () => {
    const detail = await getAdminUser(USER_ID);
    expect(lastCall().path).toBe(`/api/admin/users/${USER_ID}`);
    expect(detail.ciMasked).toBe('*****123');
  });

  it('RF-009-09: sin reputación, el nivel es «Nuevo» (RF-007-02)', async () => {
    const detail = await getAdminUser(USER_ID);
    expect(detail.reputation).toEqual(
      expect.objectContaining({ level: 'Nuevo', stars: null, consideredCharges: 0 }),
    );
  });

  it('RF-009-09: los baneos, suspensiones y habilitaciones usan los nombres de la pantalla', async () => {
    mockedRequest.mockResolvedValue(
      apiView({
        status: 'baneado',
        ban: {
          id: BAN_ID,
          reason: 'Estafa confirmada',
          source: 'reclamo',
          disputeId: null,
          bannedBy: 'admin-1',
          bannedAt: '2026-08-15T16:00:00Z',
        },
        suspension: {
          reason: 'Revisión',
          suspendedBy: 'admin-1',
          suspendedAt: '2026-08-01T10:00:00Z',
        },
        hostEnablement: {
          reason: 'Confianza',
          enabledBy: 'admin-1',
          enabledAt: '2026-06-01T10:00:00Z',
        },
      }) as never,
    );
    const detail = await getAdminUser(USER_ID);
    expect(detail.ban).toEqual({
      id: BAN_ID,
      reason: 'Estafa confirmada',
      by: 'admin-1',
      at: '2026-08-15T16:00:00Z',
    });
    expect(detail.suspension).toEqual({ reason: 'Revisión', at: '2026-08-01T10:00:00Z' });
    expect(detail.hostEnablement).toEqual({
      reason: 'Confianza',
      by: 'admin-1',
      at: '2026-06-01T10:00:00Z',
    });
  });

  it('CA-009-09: suspendAdminUser envía el motivo a POST …/suspend', async () => {
    await suspendAdminUser(USER_ID, REASON);
    expect(lastCall()).toEqual({
      path: `/api/admin/users/${USER_ID}/suspend`,
      options: { method: 'POST', body: { reason: REASON } },
    });
  });

  it('CA-009-11: reactivar sin motivo envía un cuerpo vacío', async () => {
    await reactivateAdminUser(USER_ID);
    expect(lastCall().options).toEqual({ method: 'POST', body: {} });
  });

  it('CA-009-22: banAdminUser lee `user` de la respuesta { banId, user }', async () => {
    mockedRequest.mockResolvedValue({
      banId: BAN_ID,
      user: apiView({ status: 'baneado' }),
    } as never);
    const detail = await banAdminUser(USER_ID, REASON);
    expect(lastCall()).toEqual({
      path: `/api/admin/users/${USER_ID}/ban`,
      options: { method: 'POST', body: { reason: REASON } },
    });
    expect(detail.status).toBe('baneado');
  });

  it('CA-009-34: revokeAdminBan llama a POST /admin/bans/:banId/revoke', async () => {
    mockedRequest.mockResolvedValue(undefined as never);
    await revokeAdminBan(BAN_ID, REASON);
    expect(lastCall()).toEqual({
      path: `/api/admin/bans/${BAN_ID}/revoke`,
      options: { method: 'POST', body: { reason: REASON } },
    });
  });

  it('CA-009-12: setAdminUserRole envía rol y motivo', async () => {
    await setAdminUserRole(USER_ID, 'admin', REASON);
    expect(lastCall()).toEqual({
      path: `/api/admin/users/${USER_ID}/role`,
      options: { method: 'POST', body: { role: 'admin', reason: REASON } },
    });
  });
});
