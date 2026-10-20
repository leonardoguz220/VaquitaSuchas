import {
  grantHostEnablement,
  listHostEnablements,
  revokeHostEnablement,
  transferGroupOwnership,
} from './admin';
import { MOCK_ADMIN_USER_IDS, resetMockState } from './admin.mock';
import { ApiError } from './http';

// Las habilitaciones, las estadísticas y la transferencia siguen con datos simulados. Los usuarios
// y los baneos están conectados: sus pruebas viven en `admin.api.test.ts`.

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

describe('services/admin.ts con datos simulados (spec 009): habilitaciones y titularidad', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    resetMockState();
  });

  afterEach(() => {
    jest.useRealTimers();
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
