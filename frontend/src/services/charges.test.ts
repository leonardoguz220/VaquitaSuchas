import {
  buildListMyChargesQuery,
  confirmCharge,
  rejectCharge,
  getBillingSummary,
  getCharge,
  getGroupCharges,
  getReceiptFile,
  listMyCharges,
  uploadReceipt,
  type ChargeStatus,
} from './charges';
import * as mock from './charges.mock';
import { MOCK_CHARGE_IDS, MOCK_RECEIPT_REFERENCES } from './charges.mock';
import { ApiError } from './http';
import { MOCK_BILLING_GROUP_IDS } from './group-billing.mock';

const SPOTIFY_GROUP_ID = '5b0d7c3e-0000-4000-8000-000000000103';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

/**
 * Servidor simulado para `fetch`: responde las dos rutas conectadas (T019) con los datos de
 * `charges.mock.ts`, traduce la query igual que el backend y devuelve los errores en el formato
 * A.2 (`{ statusCode, code, message }`). Así las aserciones sobre datos no cambian.
 */
async function fakeBackend(url: string, init?: RequestInit): Promise<Response> {
  const target = new URL(url, 'http://localhost');
  const signal = init?.signal ?? undefined;
  try {
    if (target.pathname === '/api/me/charges') {
      const params = target.searchParams;
      const page = await mock.listMyCharges(
        {
          status: params.getAll('status') as ChargeStatus[],
          period: params.get('period') ?? undefined,
          groupId: params.get('groupId') ?? undefined,
        },
        signal,
      );
      return jsonResponse(200, page);
    }
    const match = /^\/api\/charges\/([^/]+)$/.exec(target.pathname);
    if (match) {
      const charge = await mock.getCharge(decodeURIComponent(match[1]), signal);
      return jsonResponse(200, charge);
    }
    return jsonResponse(404, { statusCode: 404, code: 'NOT_FOUND', message: 'Ruta no simulada.' });
  } catch (error) {
    if (error instanceof ApiError) {
      return jsonResponse(error.statusCode, {
        statusCode: error.statusCode,
        code: error.code,
        message: error.message,
      });
    }
    throw error;
  }
}

const originalFetch = global.fetch;
const fetchMock = jest.fn(fakeBackend);

beforeEach(() => {
  jest.useFakeTimers();
  fetchMock.mockReset();
  fetchMock.mockImplementation(fakeBackend);
  global.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(() => {
  jest.useRealTimers();
  global.fetch = originalFetch;
});

async function settle<T>(promise: Promise<T>): Promise<T> {
  await jest.runAllTimersAsync();
  return promise;
}

async function expectRejection(promise: Promise<unknown>, shape: object) {
  const assertion = expect(promise).rejects.toMatchObject(shape);
  await jest.runAllTimersAsync();
  await assertion;
}

describe('services/charges conectado a GET /me/charges y GET /charges/:id (T019, contrato 002)', () => {
  it('RF-002-15: GET /me/charges trae los 5 estados por vencimiento descendente', async () => {
    const { items, nextCursor } = await settle(listMyCharges());
    expect(nextCursor).toBeNull();
    expect(new Set(items.map((charge) => charge.status))).toEqual(
      new Set(['pendiente', 'en_revision', 'pagado', 'atrasado', 'cancelado']),
    );
    const dueTimes = items.map((charge) => Date.parse(charge.dueAt));
    expect([...dueTimes].sort((a, b) => b - a)).toEqual(dueTimes);
    items.forEach((charge) => {
      expect(charge.group).toEqual(expect.objectContaining({ id: charge.groupId }));
      expect(charge).not.toHaveProperty('receipts');
    });
  });

  it('CA-002-32: de grupos dejados solo llegan cobros atrasado o en_revision', async () => {
    const { items } = await settle(listMyCharges());
    const former = items.filter((charge) => charge.member.isFormerMember);
    expect(former.length).toBeGreaterThan(0);
    former.forEach((charge) => expect(['atrasado', 'en_revision']).toContain(charge.status));
  });

  it('RF-002-15: filtra por estado y período como lo haría el servidor', async () => {
    const { items } = await settle(listMyCharges({ status: ['pagado'], period: '2026-09' }));
    expect(items.map((charge) => charge.id)).toEqual([MOCK_CHARGE_IDS.entryPaid]);
  });

  it('CA-002-07: GET /charges/:id trae el motivo del último rechazo y los comprobantes', async () => {
    const charge = await settle(getCharge(MOCK_CHARGE_IDS.pendingRejected));
    expect(charge.lastRejection?.reason).toBeTruthy();
    expect(charge.receipts).toHaveLength(1);
    expect(charge.allowedActions).toEqual(['uploadReceipt']);
  });

  it('CA-001-23: hay cobros con datos de pago, sin configurar y en null', async () => {
    const withInfo = await settle(getCharge(MOCK_CHARGE_IDS.pendingRejected));
    const notConfigured = await settle(getCharge(MOCK_CHARGE_IDS.inReviewNoPaymentInfo));
    const paid = await settle(getCharge(MOCK_CHARGE_IDS.paid));
    expect(withInfo.paymentInfo).toMatchObject({ configured: true });
    expect(notConfigured.paymentInfo).toMatchObject({ configured: false });
    expect(paid.paymentInfo).toBeNull();
  });

  it('CA-002-12: el cobro de otro miembro responde 403', async () => {
    await expectRejection(getCharge(MOCK_CHARGE_IDS.forbidden), {
      statusCode: 403,
      code: 'FORBIDDEN',
    });
  });

  it('CA-002-23: un cobro ajeno o inexistente responde 404', async () => {
    await expectRejection(getCharge('no-existe'), { statusCode: 404, code: 'NOT_FOUND' });
  });

  it('subida y confirmación simuladas respetan allowedActions', async () => {
    const file = new File(['x'], 'c.png', { type: 'image/png' });
    const uploaded = await settle(
      uploadReceipt(MOCK_CHARGE_IDS.pendingRejected, { file, method: 'qr', reference: 'QR-1' }),
    );
    expect(uploaded).toMatchObject({
      status: 'en_revision',
      currentReceipt: { reference: 'QR-1' },
    });
    await expectRejection(
      uploadReceipt(MOCK_CHARGE_IDS.paid, { file, method: 'qr', reference: 'x' }),
      { statusCode: 409, code: 'INVALID_TRANSITION' },
    );
    await expectRejection(confirmCharge(MOCK_CHARGE_IDS.inReviewNoPaymentInfo), {
      statusCode: 403,
    });
  });

  it('T026: confirmar y rechazar como titular responden el cobro y los errores fijos', async () => {
    const owner = MOCK_CHARGE_IDS.ownerInReview;
    const inReview = await settle(getCharge(owner));
    expect(inReview).toMatchObject({
      status: 'en_revision',
      allowedActions: ['confirm', 'reject'],
    });

    // CA-002-06: pagado con quién y cuándo.
    const confirmed = await settle(confirmCharge(owner, { version: inReview.version }));
    expect(confirmed).toMatchObject({
      status: 'pagado',
      settledBy: { fullName: 'Ana Quispe Mamani' },
      paidAt: expect.any(String),
      currentReceipt: { status: 'confirmado' },
    });
    expect(confirmed.timeline.at(-1)).toMatchObject({ type: 'confirmado', toStatus: 'pagado' });
    await expectRejection(confirmCharge(owner, { version: 1 }), { code: 'STALE_STATE' });

    // CA-002-07 y CA-002-30: pendiente si no venció, atrasado si ya venció.
    const body = { reason: 'Monto distinto', invalidReceipt: true };
    expect(await settle(rejectCharge(owner, body))).toMatchObject({
      status: 'pendiente',
      lastRejection: { reason: 'Monto distinto', invalidReceipt: true },
    });
    expect(await settle(rejectCharge(MOCK_CHARGE_IDS.ownerInReviewOverdue, body))).toMatchObject({
      status: 'atrasado',
    });
    // CA-002-08: sin motivo.
    await expectRejection(rejectCharge(owner, { reason: ' ', invalidReceipt: false }), {
      statusCode: 400,
      code: 'VALIDATION_ERROR',
    });
    await expectRejection(confirmCharge(MOCK_CHARGE_IDS.paid), { statusCode: 403 });

    const receiptId = inReview.currentReceipt?.id ?? '';
    expect(await settle(getReceiptFile(owner, receiptId))).toMatchObject({
      url: expect.any(String),
    });
    const overdue = await settle(getCharge(MOCK_CHARGE_IDS.ownerInReviewOverdue));
    await expectRejection(getReceiptFile(overdue.id, overdue.currentReceipt?.id ?? ''), {
      statusCode: 410,
      code: 'FILE_DELETED',
    });
    const queue = await settle(
      getGroupCharges(MOCK_BILLING_GROUP_IDS.owner, { status: ['en_revision'] }),
    );
    expect(queue.items.map((charge) => charge.id)).toContain(owner);
  });

  it('T022: la subida simulada agrega el evento, reemplaza en revisión y responde los errores fijos', async () => {
    const file = new File(['x'], 'c.jpg', { type: 'image/jpeg' });
    const uploaded = await settle(
      uploadReceipt(MOCK_CHARGE_IDS.pendingRejected, {
        file,
        method: 'transferencia',
        reference: 'TRX-9',
        version: 3,
      }),
    );
    expect(uploaded.timeline.at(-1)).toMatchObject({
      type: 'comprobante_subido',
      toStatus: 'en_revision',
    });

    const replaced = await settle(
      uploadReceipt(MOCK_CHARGE_IDS.inReviewNoPaymentInfo, { file, method: 'qr', reference: 'Q' }),
    );
    expect(replaced.timeline.at(-1)?.type).toBe('comprobante_reemplazado');
    expect(replaced.receipts[0]).toMatchObject({ reference: 'TRX-88213', status: 'reemplazado' });

    const id = MOCK_CHARGE_IDS.pendingRejected;
    const base = { file, method: 'qr' as const };
    await expectRejection(
      uploadReceipt(id, { ...base, reference: MOCK_RECEIPT_REFERENCES.alreadyUsed }),
      {
        statusCode: 409,
        code: 'REFERENCE_ALREADY_USED',
      },
    );
    await expectRejection(
      uploadReceipt(id, { ...base, reference: MOCK_RECEIPT_REFERENCES.storageDown }),
      {
        statusCode: 503,
        code: 'SERVICE_UNAVAILABLE',
      },
    );
    await expectRejection(uploadReceipt(id, { ...base, reference: 'A', version: 1 }), {
      code: 'STALE_STATE',
    });
    await expectRejection(uploadReceipt(id, { ...base, reference: ' ' }), {
      code: 'VALIDATION_ERROR',
    });
    const exe = new File(['x'], 'v.exe', { type: 'application/x-msdownload' });
    await expectRejection(uploadReceipt(id, { file: exe, method: 'qr', reference: 'A' }), {
      code: 'UNSUPPORTED_FILE_TYPE',
    });
  });

  it('archivo, historial y resumen del grupo responden con la forma del contrato', async () => {
    const paid = await settle(getCharge(MOCK_CHARGE_IDS.paid));
    const receiptId = paid.currentReceipt?.id ?? '';
    expect(await settle(getReceiptFile(MOCK_CHARGE_IDS.paid, receiptId))).toMatchObject({
      mime: 'application/pdf',
    });

    const page = await settle(getGroupCharges(SPOTIFY_GROUP_ID));
    expect(page.items.length).toBeGreaterThan(0);
    await expectRejection(getGroupCharges('otro'), { statusCode: 404 });

    const summary = await settle(getBillingSummary(SPOTIFY_GROUP_ID));
    expect(summary.availablePeriods).toContain(summary.period);
    await expectRejection(getBillingSummary('otro'), { statusCode: 404 });
  });

  it('CA-002-17: historial de 5 en 5 y totales solo para el titular, sin comprobantes', async () => {
    const owner = MOCK_BILLING_GROUP_IDS.owner;
    const first = await settle(getGroupCharges(owner, { limit: 5 }));
    expect(first.items).toHaveLength(5);
    const second = await settle(
      getGroupCharges(owner, { limit: 5, cursor: first.nextCursor ?? '' }),
    );
    expect(second.nextCursor).toBeNull();
    expect([...first.items, ...second.items].some((charge) => charge.origin === 'ingreso')).toBe(
      true,
    );

    expect((await settle(getBillingSummary(owner))).ownerTotals).toBeDefined();
    expect((await settle(getBillingSummary(owner, '2026-09'))).period).toBe('2026-09');

    const member = await settle(getBillingSummary(MOCK_BILLING_GROUP_IDS.member));
    expect(member).not.toHaveProperty('ownerTotals');
    member.rows.forEach(({ charge }) => {
      expect(charge).not.toHaveProperty('receipts');
      expect(charge).not.toHaveProperty('currentReceipt');
      charge.timeline.forEach((event) => expect(event).not.toHaveProperty('reason'));
    });

    await expectRejection(getBillingSummary(MOCK_BILLING_GROUP_IDS.noCycle), {
      statusCode: 404,
    });
  });
});

describe('services/charges: mapeo de query y ruta hacia la API (T019)', () => {
  it('RF-002-15: status se envía repetido por cada estado y period, groupId, limit y cursor van en la URL', async () => {
    await settle(
      listMyCharges({
        status: ['pendiente', 'atrasado'],
        period: '2026-10',
        groupId: SPOTIFY_GROUP_ID,
        limit: 5,
        cursor: 'abc',
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/me/charges?status=pendiente&status=atrasado&period=2026-10&groupId=${SPOTIFY_GROUP_ID}&limit=5&cursor=abc`,
      expect.objectContaining({ method: 'GET', credentials: 'same-origin' }),
    );
  });

  it('RF-002-15: sin filtros la ruta no lleva query y una lista vacía de estados no se envía', async () => {
    expect(buildListMyChargesQuery({})).toBe('');
    expect(buildListMyChargesQuery({ status: [] })).toBe('');
    await settle(listMyCharges({ status: [] }));
    expect(fetchMock).toHaveBeenLastCalledWith('/api/me/charges', expect.anything());
  });

  it('RF-002-15: limit 0 se envía y un cursor vacío no se envía', () => {
    expect(buildListMyChargesQuery({ limit: 0 })).toBe('?limit=0');
    expect(buildListMyChargesQuery({ cursor: '' })).toBe('');
  });

  it('CA-002-23: el id del cobro va codificado en la ruta de GET /charges/:id', async () => {
    await expectRejection(getCharge('a/b'), { statusCode: 404, code: 'NOT_FOUND' });
    expect(fetchMock).toHaveBeenLastCalledWith('/api/charges/a%2Fb', expect.anything());
  });

  it('RF-002-15: un error sin formato A.2 llega como error genérico, sin inventar código', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => '<html>fallo</html>',
    } as unknown as Response);
    await expectRejection(getCharge(MOCK_CHARGE_IDS.paid), {
      statusCode: 500,
      code: 'UNEXPECTED_RESPONSE',
    });
  });
});
