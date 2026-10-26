import {
  deleteAndSuspendListing,
  deleteListing,
  listReportedListings,
  restoreListing,
} from './admin-moderation';
import { decide, listReports, resetModerationMock } from './admin-moderation.mock';
import { ApiError, apiRequest } from './http';

jest.mock('./http', () => ({ ...jest.requireActual('./http'), apiRequest: jest.fn() }));

const mockedRequest = jest.mocked(apiRequest);
const LISTING_ID = '6b1d3f0e-0000-4000-8000-0000000000c1';
const REASON = 'Motivo suficientemente largo para la prueba.';

describe('services/admin-moderation.ts conectado al backend (spec 009 T032)', () => {
  beforeEach(() => {
    mockedRequest.mockReset();
  });

  it('RF-009-12: la cola pide GET /api/admin/listings/reports y devuelve items', async () => {
    const item = { listingId: LISTING_ID, reports: [] };
    mockedRequest.mockResolvedValue({ items: [item] } as never);
    await expect(listReportedListings()).resolves.toEqual([item]);
    expect(mockedRequest).toHaveBeenCalledWith('/api/admin/listings/reports');
  });

  it.each([
    ['CA-009-14: restaurar', restoreListing, 'restore'],
    ['CA-009-15: eliminar', deleteListing, 'delete'],
    ['RF-009-13: eliminar y suspender', deleteAndSuspendListing, 'delete-and-suspend'],
  ])('%s envía el motivo con POST', async (_name, action, path) => {
    const result = { listingId: LISTING_ID, decision: path, status: 'cerrada' };
    mockedRequest.mockResolvedValue(result as never);
    await expect(action(LISTING_ID, REASON)).resolves.toEqual(result);
    expect(mockedRequest).toHaveBeenCalledWith(`/api/admin/listings/${LISTING_ID}/${path}`, {
      method: 'POST',
      body: { reason: REASON },
    });
  });

  it('RF-009-13: deja pasar el error del servidor (motivo inválido)', async () => {
    const invalid = new ApiError(400, 'VALIDATION_ERROR', 'x');
    mockedRequest.mockRejectedValue(invalid);
    await expect(restoreListing(LISTING_ID, 'corto')).rejects.toBe(invalid);
  });
});

describe('admin-moderation.mock con datos simulados', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    resetModerationMock();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  async function run<T>(promise: Promise<T>): Promise<T> {
    const outcome = promise.then(
      (value) => ({ ok: true as const, value }),
      (error: unknown) => ({ ok: false as const, error }),
    );
    await jest.advanceTimersByTimeAsync(400);
    const settled = await outcome;
    if (!settled.ok) throw settled.error;
    return settled.value;
  }

  it('RF-009-12: la cola simulada trae las publicaciones con sus motivos', async () => {
    const queue = await run(listReports());
    const hidden = queue.find((item) => item.status === 'oculta');
    expect(hidden?.reports).toHaveLength(3);
  });

  it('RF-009-13: decidir saca la publicación de la cola y exige motivo válido', async () => {
    await expect(run(decide('cupo-netflix-premium', 'restore', 'corto'))).rejects.toMatchObject({
      statusCode: 400,
    });
    const result = await run(decide('cupo-netflix-premium', 'delete', REASON));
    expect(result.status).toBe('cerrada');
    const queue = await run(listReports());
    expect(queue.map((item) => item.listingId)).not.toContain('cupo-netflix-premium');
  });
});
