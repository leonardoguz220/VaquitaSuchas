import {
  banAdminUser,
  getAdminUser,
  grantHostEnablement,
  listAdminUsers,
  listHostEnablements,
  reactivateAdminUser,
  revokeHostEnablement,
  setAdminUserRole,
  suspendAdminUser,
  transferGroupOwnership,
  type AdminUsersPage,
} from './admin';
import { MOCK_ADMIN_USER_IDS, MOCK_CURRENT_ADMIN_ID, resetMockState } from './admin.mock';
import { ApiError } from './http';

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

describe('services/admin.ts (spec 009)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    resetMockState();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('CA-009-07: filtra la lista por estado y por rol, y la pagina con cursor', async () => {
    const suspended: AdminUsersPage = await run(listAdminUsers({ status: 'suspendido' }));
    expect(suspended.items.map((item) => item.status)).toEqual(['suspendido']);

    const admins = await run(listAdminUsers({ role: 'admin' }));
    expect(admins.items.every((item) => item.role === 'admin')).toBe(true);

    const first = await run(listAdminUsers({ limit: 2 }));
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).not.toBeNull();
    const second = await run(listAdminUsers({ limit: 2, cursor: first.nextCursor ?? undefined }));
    expect(second.items[0]?.id).not.toBe(first.items[0]?.id);
  });

  it('CA-009-07: sin resultados devuelve lista vacía, no error', async () => {
    const page = await run(listAdminUsers({ q: 'zzzz-no-existe' }));
    expect(page).toEqual({ items: [], nextCursor: null });
  });

  it('CA-009-07: la búsqueda ignora tildes y mayúsculas', async () => {
    const page = await run(listAdminUsers({ q: 'RAUL FLORES' }));
    expect(page.items.map((item) => item.fullName)).toEqual(['Raúl Flores']);
  });

  it('CA-009-08: la ficha no trae CI en claro ni hash de contraseña', async () => {
    const detail = await run(getAdminUser(MOCK_ADMIN_USER_IDS.kevin));
    expect(detail.ciMasked).toMatch(/^\*+\d{3}$/);
    expect(detail).not.toHaveProperty('passwordHash');
    expect(detail).not.toHaveProperty('ci');
  });

  it('CA-009-09: suspender exige un motivo de 10 a 300 caracteres', async () => {
    const error = await failureOf(suspendAdminUser(MOCK_ADMIN_USER_IDS.ana, 'corto'));
    expect(error.statusCode).toBe(400);
    expect(error.code).toBe('VALIDATION_ERROR');
  });

  it('CA-009-09: suspender con motivo válido deja la cuenta suspendida', async () => {
    const detail = await run(suspendAdminUser(MOCK_ADMIN_USER_IDS.ana, REASON));
    expect(detail.status).toBe('suspendido');
    expect(detail.suspension?.reason).toBe(REASON);
  });

  it('CA-009-10: no se puede suspender a uno mismo (RN-009-02)', async () => {
    const error = await failureOf(suspendAdminUser(MOCK_CURRENT_ADMIN_ID, REASON));
    expect(error.statusCode).toBe(422);
    expect(error.code).toBe('BUSINESS_RULE');
  });

  it('CA-009-11: reactivar solo desde suspendido', async () => {
    await run(suspendAdminUser(MOCK_ADMIN_USER_IDS.ana, REASON));
    const detail = await run(reactivateAdminUser(MOCK_ADMIN_USER_IDS.ana));
    expect(detail.status).toBe('activo');
    expect(detail.suspension).toBeNull();

    const error = await failureOf(reactivateAdminUser(MOCK_ADMIN_USER_IDS.ana));
    expect(error.statusCode).toBe(409);
    expect(error.code).toBe('INVALID_TRANSITION');
  });

  it('CA-009-22: banear deja la cuenta baneada y no se puede repetir', async () => {
    const detail = await run(banAdminUser(MOCK_ADMIN_USER_IDS.ana, REASON));
    expect(detail.status).toBe('baneado');
    expect(detail.ban?.reason).toBe(REASON);

    const error = await failureOf(banAdminUser(MOCK_ADMIN_USER_IDS.ana, REASON));
    expect(error.statusCode).toBe(409);
  });

  it('CA-009-24: un baneado no se reactiva con la acción de reactivar', async () => {
    const error = await failureOf(reactivateAdminUser(MOCK_ADMIN_USER_IDS.raul));
    expect(error.statusCode).toBe(422);
    expect(error.code).toBe('BUSINESS_RULE');
  });

  it('CA-009-12: no se puede quitar el último administrador (RN-009-01)', async () => {
    await run(setAdminUserRole('u-admin-leonardo', 'usuario', REASON));
    const error = await failureOf(setAdminUserRole(MOCK_CURRENT_ADMIN_ID, 'usuario', REASON));
    expect(error.statusCode).toBe(422);
    expect(error.code).toBe('BUSINESS_RULE');
  });

  it('CA-009-28: habilita y quita una habilitación manual con motivo', async () => {
    const granted = await run(grantHostEnablement(MOCK_ADMIN_USER_IDS.ana, REASON));
    expect(granted.userId).toBe(MOCK_ADMIN_USER_IDS.ana);

    const active = await run(listHostEnablements());
    expect(active.map((row) => row.userId)).toContain(MOCK_ADMIN_USER_IDS.ana);

    await run(revokeHostEnablement(MOCK_ADMIN_USER_IDS.ana, REASON));
    const after = await run(listHostEnablements());
    expect(after.map((row) => row.userId)).not.toContain(MOCK_ADMIN_USER_IDS.ana);
  });

  it('CA-009-28: habilitar sin motivo válido falla antes de cambiar nada', async () => {
    const error = await failureOf(grantHostEnablement(MOCK_ADMIN_USER_IDS.ana, ''));
    expect(error.statusCode).toBe(400);
  });

  it('CA-009-35: transferir la titularidad exige motivo y une a una persona existente', async () => {
    const error = await failureOf(transferGroupOwnership('g-1', MOCK_ADMIN_USER_IDS.ana, 'corto'));
    expect(error.statusCode).toBe(400);
    await run(transferGroupOwnership('g-1', MOCK_ADMIN_USER_IDS.ana, REASON));
    const missing = await failureOf(transferGroupOwnership('g-1', 'u-no-existe', REASON));
    expect(missing.statusCode).toBe(404);
  });
});
