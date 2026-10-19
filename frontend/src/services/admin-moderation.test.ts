import {
  deleteAndSuspendListing,
  deleteListing,
  listReportedListings,
  restoreListing,
} from './admin-moderation';
import { resetModerationMock } from './admin-moderation.mock';
import { ApiError } from './http';

async function run<T>(promise: Promise<T>): Promise<T> {
  await jest.advanceTimersByTimeAsync(400);
  return promise;
}

async function failureOf(promise: Promise<unknown>): Promise<ApiError> {
  const outcome = promise.then(
    () => null,
    (error: unknown) => error as ApiError,
  );
  await jest.advanceTimersByTimeAsync(400);
  const error = await outcome;
  if (!error) throw new Error('Se esperaba un error y llegó una respuesta.');
  return error;
}

const REASON = 'Motivo suficientemente largo para la prueba.';

describe('services/admin-moderation.ts (spec 009 T032)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    resetModerationMock();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('RF-009-12: la cola trae las publicaciones con sus motivos y comentarios', async () => {
    const queue = await run(listReportedListings());
    const hidden = queue.find((item) => item.status === 'oculta');
    expect(hidden?.reports).toHaveLength(3);
    expect(hidden?.reports.every((report) => report.reason.length > 0)).toBe(true);
  });

  it('CA-009-14: restaurar registra quién y por qué', async () => {
    const result = await run(restoreListing('cupo-netflix-premium', REASON));
    expect(result.action).toBe('restaurar');
    expect(result.decidedBy).toBeTruthy();
    expect(result.reason).toBe(REASON);
  });

  it('CA-009-15: eliminar notifica al titular de la decisión', async () => {
    const result = await run(deleteListing('cupo-netflix-premium', REASON));
    expect(result.action).toBe('eliminar');
    expect(result.ownerNotified).toBe(true);
  });

  it('RF-009-13: eliminar y suspender al titular queda con esa acción', async () => {
    const result = await run(deleteAndSuspendListing('cupo-youtube-familiar', REASON));
    expect(result.action).toBe('eliminar_y_suspender');
  });

  it('RF-009-13: una decisión exige un motivo de 10 a 300 caracteres', async () => {
    const error = await failureOf(restoreListing('cupo-netflix-premium', 'corto'));
    expect(error.statusCode).toBe(400);
  });

  it('RF-009-13: al decidir, la publicación sale de la cola', async () => {
    await run(restoreListing('cupo-netflix-premium', REASON));
    const queue = await run(listReportedListings());
    expect(queue.map((item) => item.id)).not.toContain('cupo-netflix-premium');
  });
});
