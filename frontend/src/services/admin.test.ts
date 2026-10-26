import {
  getAdminStats,
  grantHostEnablement,
  listHostEnablements,
  revokeHostEnablement,
  transferGroupOwnership,
} from './admin';
import {
  MOCK_ADMIN_USER_IDS,
  grantHostEnablement as grantMock,
  listHostEnablements as listMock,
  resetMockState,
  revokeHostEnablement as revokeMock,
  transferOwnership as transferMock,
} from './admin.mock';
import { ApiError, apiRequest } from './http';

jest.mock('./http', () => ({ ...jest.requireActual('./http'), apiRequest: jest.fn() }));

const mockedRequest = jest.mocked(apiRequest);

// Los usuarios y los baneos se prueban en `admin.api.test.ts`. Aquí: habilitaciones, estadísticas
// y transferencia contra `apiRequest`, y el simulador (`admin.mock.ts`) por separado.

/** Espera la latencia simulada y devuelve el resultado, sin que un rechazo quede sin manejar. */
async function settle<T>(
  promise: Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false; error: unknown }> {
  const outcome = promise.then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  );
  await jest.advanceTimersByTimeAsync(400);
  return outcome;
}

async function run<T>(promise: Promise<T>): Promise<T> {
  const outcome = await settle(promise);
  if (!outcome.ok) throw outcome.error;
  return outcome.value;
}

async function failureOf(promise: Promise<unknown>): Promise<ApiError> {
  const outcome = await settle(promise);
  if (outcome.ok) throw new Error('Se esperaba un error y llegó una respuesta.');
  return outcome.error as ApiError;
}

const REASON = 'Motivo suficientemente largo para la prueba.';

const USER_ID = '6b1d3f0e-0000-4000-8000-0000000000u1';
const userView = {
  id: USER_ID,
  fullName: 'Raúl Flores',
  reputation: { level: null, stars: null, consideredCharges: 0 },
  ban: null,
  suspension: null,
  hostEnablement: null,
};

describe('services/admin.ts conectado al backend (spec 009): habilitaciones, estadísticas y titularidad', () => {
  beforeEach(() => {
    mockedRequest.mockReset();
  });

  const view = (overrides: Record<string, unknown> = {}) => ({
    id: 'e1',
    userId: USER_ID,
    reason: REASON,
    enabledBy: 'admin-1',
    enabledAt: '2026-10-01T12:00:00Z',
    revokedAt: null,
    revokedBy: null,
    revokeReason: null,
    ...overrides,
  });

  it('CA-009-28: lista las habilitaciones vigentes y completa el nombre con la ficha', async () => {
    mockedRequest.mockImplementation(async (path: string) =>
      path.includes('host-enablements') ? { items: [view()] } : userView,
    );
    await expect(listHostEnablements()).resolves.toEqual([
      {
        userId: USER_ID,
        fullName: 'Raúl Flores',
        reason: REASON,
        grantedBy: 'admin-1',
        grantedAt: '2026-10-01T12:00:00Z',
      },
    ]);
    expect(mockedRequest).toHaveBeenCalledWith('/api/admin/host-enablements?active=true');
  });

  it('CA-009-28: si la ficha falla, la fila se muestra con el id', async () => {
    mockedRequest.mockImplementation(async (path: string) => {
      if (path.includes('host-enablements')) return { items: [view()] };
      throw new ApiError(404, 'NOT_FOUND', 'x');
    });
    const [row] = await listHostEnablements();
    expect(row.fullName).toBe(USER_ID);
  });

  it('CA-009-28: habilita y quita con POST y motivo', async () => {
    mockedRequest.mockImplementation(async (path: string) =>
      path.endsWith('/host-enablement') ? view() : userView,
    );
    const granted = await grantHostEnablement(USER_ID, REASON);
    expect(granted.fullName).toBe('Raúl Flores');
    expect(mockedRequest).toHaveBeenCalledWith(`/api/admin/users/${USER_ID}/host-enablement`, {
      method: 'POST',
      body: { reason: REASON },
    });

    mockedRequest.mockReset();
    mockedRequest.mockResolvedValue(view() as never);
    await expect(revokeHostEnablement(USER_ID, REASON)).resolves.toBeUndefined();
    expect(mockedRequest).toHaveBeenCalledWith(
      `/api/admin/users/${USER_ID}/host-enablement/revoke`,
      { method: 'POST', body: { reason: REASON } },
    );
  });

  it('CA-009-16: getAdminStats pide GET /api/admin/stats', async () => {
    mockedRequest.mockResolvedValue({ punctualityRate: null } as never);
    await expect(getAdminStats()).resolves.toEqual({ punctualityRate: null });
    expect(mockedRequest).toHaveBeenCalledWith('/api/admin/stats');
  });

  it('CA-009-35: transferGroupOwnership envía toUserId y motivo', async () => {
    mockedRequest.mockResolvedValue({} as never);
    await transferGroupOwnership('g-1', USER_ID, REASON);
    expect(mockedRequest).toHaveBeenCalledWith('/api/admin/groups/g-1/transfer-ownership', {
      method: 'POST',
      body: { toUserId: USER_ID, reason: REASON },
    });
  });
});

describe('admin.mock con datos simulados (spec 009): habilitaciones y titularidad', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    resetMockState();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('CA-009-28: habilita y quita una habilitación manual con motivo', async () => {
    const granted = await run(grantMock(MOCK_ADMIN_USER_IDS.ana, REASON));
    expect(granted.userId).toBe(MOCK_ADMIN_USER_IDS.ana);

    const active = await run(listMock());
    expect(active.map((row) => row.userId)).toContain(MOCK_ADMIN_USER_IDS.ana);

    await run(revokeMock(MOCK_ADMIN_USER_IDS.ana, REASON));
    const after = await run(listMock());
    expect(after.map((row) => row.userId)).not.toContain(MOCK_ADMIN_USER_IDS.ana);
  });

  it('CA-009-28: habilitar sin motivo válido falla antes de cambiar nada', async () => {
    const error = await failureOf(grantMock(MOCK_ADMIN_USER_IDS.ana, ''));
    expect(error.statusCode).toBe(400);
  });

  it('CA-009-35: transferir la titularidad exige motivo y une a una persona existente', async () => {
    const error = await failureOf(transferMock('g-1', MOCK_ADMIN_USER_IDS.ana, 'corto'));
    expect(error.statusCode).toBe(400);
    await run(transferMock('g-1', MOCK_ADMIN_USER_IDS.ana, REASON));
    const missing = await failureOf(transferMock('g-1', 'u-no-existe', REASON));
    expect(missing.statusCode).toBe(404);
  });
});
