import {
  getAdminDispute,
  getAdminDisputeEvidence,
  listAdminDisputes,
  resolveAdminDispute,
} from './admin-disputes';
import { apiRequest } from './http';

jest.mock('./http', () => {
  const actual = jest.requireActual('./http');
  return { ...actual, apiRequest: jest.fn() };
});

const mockedRequest = jest.mocked(apiRequest);
const ID = '6b1d3f0e-0000-4000-8000-0000000000d1';
const REASON = 'Motivo suficientemente largo para la prueba.';

const row = (overrides: Record<string, unknown> = {}) => ({
  id: ID,
  requestId: 'r1',
  kind: 'pago_sin_ingreso',
  status: 'abierto',
  openedBy: { userId: 'u1', fullName: 'Ana Quispe' },
  accused: { userId: 'u2', fullName: 'Kevin Rojas' },
  openedAt: '2026-10-17T09:12:00Z',
  respondedAt: null,
  hasResponse: true,
  resolvedAt: null,
  ...overrides,
});

const resolution = (result: string) => ({
  status: 'resuelto',
  resolution: { result, reason: REASON, resolvedAt: '2026-10-20T10:00:00Z' },
});

describe('services/admin-disputes.ts conectado al backend (spec 009 T025)', () => {
  beforeEach(() => mockedRequest.mockReset());

  it('RF-009-20: la cola pide GET /api/admin/disputes y traduce partes y fechas', async () => {
    mockedRequest.mockResolvedValueOnce({ items: [row()], nextCursor: null });
    const page = await listAdminDisputes('abierto');
    expect(mockedRequest).toHaveBeenCalledWith('/api/admin/disputes?status=abierto');
    expect(page.items[0]).toMatchObject({
      type: 'pago_sin_ingreso',
      requesterName: 'Ana Quispe',
      accusedName: 'Kevin Rojas',
      groupName: null,
      hasResponse: true,
    });
  });

  it('CA-009-27: la evidencia usa …/evidence y nombra a las partes sin inventar datos', async () => {
    mockedRequest.mockResolvedValueOnce({
      dispute: { openedBy: { userId: 'u1', fullName: 'Ana Quispe' } },
      disputes: [
        {
          openedBy: { userId: 'u1', fullName: 'Ana Quispe' },
          description: 'No me dieron acceso.',
          response: { text: 'Sí se lo di.' },
        },
      ],
      request: { quote: { amountCents: 1200 } },
      timeline: [{ type: 'comprobante_subido', occurredAt: '2026-10-16T20:11:00Z' }],
      messages: [
        { senderId: 'u1', body: 'Hola', image: null, createdAt: '2026-10-16T19:50:00Z' },
        { senderId: 'u2', body: null, image: { url: 'x' }, createdAt: '2026-10-16T19:51:00Z' },
      ],
      proof: { reference: 'TRF-1', file: { url: 'https://signed/file' } },
    });
    const evidence = await getAdminDisputeEvidence(ID);
    expect(mockedRequest).toHaveBeenCalledWith(`/api/admin/disputes/${ID}/evidence`);
    expect(evidence.timeline[0].label).toBe('Se subió el comprobante');
    expect(evidence.chat.map((message) => message.author)).toEqual(['Ana Quispe', 'Persona B']);
    expect(evidence.chat[1].text).toBe('Imagen adjunta');
    expect(evidence.receipt).toEqual({
      label: 'Comprobante · Ref. TRF-1',
      url: 'https://signed/file',
    });
    expect(evidence.quoteCents).toBe(1200);
    expect(evidence.responses).toEqual([{ by: 'Persona B', text: 'Sí se lo di.' }]);
  });

  it('CA-009-27: sin reclamo abierto el 403 de la evidencia llega tal cual', async () => {
    mockedRequest.mockRejectedValueOnce(Object.assign(new Error('x'), { statusCode: 403 }));
    await expect(getAdminDisputeEvidence(ID)).rejects.toMatchObject({ statusCode: 403 });
  });

  it('CA-009-25: resolver envía result y reason y devuelve el reclamo resuelto', async () => {
    mockedRequest
      .mockResolvedValueOnce(resolution('estafa_confirmada'))
      .mockResolvedValueOnce({ items: [row({ status: 'resuelto' })], nextCursor: null });
    const dispute = await resolveAdminDispute(ID, 'estafa_confirmada', REASON);
    expect(mockedRequest.mock.calls[0]).toEqual([
      `/api/admin/disputes/${ID}/resolve`,
      { method: 'POST', body: { result: 'estafa_confirmada', reason: REASON } },
    ]);
    expect(dispute).toMatchObject({ status: 'resuelto', result: 'estafa_confirmada' });
  });

  it('CA-009-26 y CA-009-30: sin falta y comprobante falso quedan con su resultado', async () => {
    mockedRequest
      .mockResolvedValueOnce(resolution('sin_falta'))
      .mockResolvedValueOnce({ items: [row({ kind: 'comprobante_falso' })], nextCursor: null });
    const dispute = await resolveAdminDispute(ID, 'sin_falta', REASON);
    expect(dispute).toMatchObject({ type: 'comprobante_falso', result: 'sin_falta' });
  });

  it('CA-009-25: un 409 INVALID_TRANSITION al resolver llega al llamador', async () => {
    mockedRequest.mockRejectedValueOnce(
      Object.assign(new Error('ya'), { statusCode: 409, code: 'INVALID_TRANSITION' }),
    );
    await expect(resolveAdminDispute(ID, 'sin_falta', REASON)).rejects.toMatchObject({
      code: 'INVALID_TRANSITION',
    });
  });

  it('RF-009-20: la ficha se busca recorriendo la cola y da 404 si no está', async () => {
    mockedRequest
      .mockResolvedValueOnce({ items: [row({ id: 'otro' })], nextCursor: 'c1' })
      .mockResolvedValueOnce({ items: [row()], nextCursor: null });
    await expect(getAdminDispute(ID)).resolves.toMatchObject({ id: ID });
    expect(mockedRequest.mock.calls[1][0]).toContain('cursor=c1');

    mockedRequest.mockResolvedValueOnce({ items: [], nextCursor: null });
    await expect(getAdminDispute(ID)).rejects.toMatchObject({ statusCode: 404 });
  });
});
