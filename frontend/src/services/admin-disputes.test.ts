import { getAdminDisputeEvidence, listAdminDisputes, resolveAdminDispute } from './admin-disputes';
import { resetDisputesMock } from './admin-disputes.mock';
import { ApiError } from './http';

async function run<T>(promise: Promise<T>): Promise<T> {
  const pending = promise;
  await jest.advanceTimersByTimeAsync(400);
  return pending;
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

describe('services/admin-disputes.ts (spec 009 T024)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    resetDisputesMock();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('RF-009-20: la cola muestra los abiertos primero', async () => {
    const page = await run(listAdminDisputes());
    const statuses = page.items.map((item) => item.status);
    expect(statuses).toEqual(['abierto', 'abierto', 'resuelto']);
  });

  it('CA-009-27: la evidencia trae línea de tiempo, chat y comprobante, y marca la apertura', async () => {
    const evidence = await run(getAdminDisputeEvidence('rec-1'));
    expect(evidence.timeline.length).toBeGreaterThan(0);
    expect(evidence.chat.length).toBeGreaterThan(0);
    expect(evidence.receipt).not.toBeNull();
    expect(evidence.openedAt).toBeTruthy();
  });

  it('CA-009-27: sin reclamo no hay evidencia que mostrar (404)', async () => {
    const error = await failureOf(getAdminDisputeEvidence('rec-x-no-existe'));
    expect(error.statusCode).toBe(404);
  });

  it('CA-009-25: resolver como estafa confirmada deja el reclamo resuelto con ese resultado', async () => {
    const dispute = await run(resolveAdminDispute('rec-1', 'estafa_confirmada', REASON));
    expect(dispute.status).toBe('resuelto');
    expect(dispute.result).toBe('estafa_confirmada');
    expect(dispute.resolvedAt).not.toBeNull();
  });

  it('CA-009-26: resolver como sin falta no cambia el reclamo a otro resultado', async () => {
    const dispute = await run(resolveAdminDispute('rec-2', 'sin_falta', REASON));
    expect(dispute.result).toBe('sin_falta');
  });

  it('CA-009-30: un comprobante falso se resuelve igual que un pago sin ingreso', async () => {
    const dispute = await run(resolveAdminDispute('rec-2', 'estafa_confirmada', REASON));
    expect(dispute.type).toBe('comprobante_falso');
    expect(dispute.result).toBe('estafa_confirmada');
  });

  it('CA-009-25: resolver exige un motivo de 10 a 300 caracteres', async () => {
    const error = await failureOf(resolveAdminDispute('rec-1', 'sin_falta', 'corto'));
    expect(error.statusCode).toBe(400);
  });

  it('CA-009-25: un reclamo ya resuelto no se vuelve a resolver', async () => {
    const error = await failureOf(resolveAdminDispute('rec-3', 'sin_falta', REASON));
    expect(error.statusCode).toBe(409);
    expect(error.code).toBe('INVALID_TRANSITION');
  });
});
