import {
  buildListMyChargesQuery,
  cancelCharge,
  confirmCharge,
  rejectCharge,
  getBillingSummary,
  getCharge,
  getGroupCharges,
  getReceiptFile,
  listMyCharges,
  registerManualPayment,
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
    const groupMatch = /^\/api\/groups\/([^/]+)\/(charges|billing\/summary)$/.exec(target.pathname);
    if (groupMatch) {
      const groupId = decodeURIComponent(groupMatch[1]);
      const params = target.searchParams;
      if (groupMatch[2] === 'charges') {
        const limit = params.get('limit');
        const page = await mock.getGroupCharges(
          groupId,
          {
            period: params.get('period') ?? undefined,
            status: params.getAll('status') as ChargeStatus[],
            userId: params.get('userId') ?? undefined,
            limit: limit === null ? undefined : Number(limit),
            cursor: params.get('cursor') ?? undefined,
          },
          signal,
        );
        return jsonResponse(200, page);
      }
      const summary = await mock.getBillingSummary(
        groupId,
        params.get('period') ?? undefined,
        signal,
      );
      return jsonResponse(200, summary);
    }
    const receiptMatch = /^\/api\/charges\/([^/]+)\/receipts$/.exec(target.pathname);
    if (receiptMatch && init?.method === 'POST' && init.body instanceof FormData) {
      const form = init.body;
      const version = form.get('version');
      const charge = await mock.uploadReceipt(decodeURIComponent(receiptMatch[1]), {
        file: form.get('file') as File,
        method: form.get('method') as 'qr' | 'transferencia',
        reference: String(form.get('reference')),
        version: version === null ? undefined : Number(version),
      });
      return jsonResponse(201, charge);
    }
    const fileMatch = /^\/api\/charges\/([^/]+)\/receipts\/([^/]+)\/file$/.exec(target.pathname);
    if (fileMatch) {
      const file = await mock.getReceiptFile(
        decodeURIComponent(fileMatch[1]),
        decodeURIComponent(fileMatch[2]),
        signal,
      );
      return jsonResponse(200, file);
    }
    const actionMatch = /^\/api\/charges\/([^/]+)\/(confirm|reject|manual-payment|cancel)$/.exec(
      target.pathname,
    );
    if (actionMatch && init?.method === 'POST') {
      const chargeId = decodeURIComponent(actionMatch[1]);
      const body = JSON.parse(String(init.body ?? '{}'));
      const actions = {
        confirm: () => mock.confirmCharge(chargeId, body),
        reject: () => mock.rejectCharge(chargeId, body),
        'manual-payment': () => mock.manualPayment(chargeId, body),
        cancel: () => mock.cancelCharge(chargeId, body),
      };
      return jsonResponse(200, await actions[actionMatch[2] as keyof typeof actions]());
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

  it('T027: confirmar y rechazar salen por POST al proxy con version y motivo (CA-002-06, CA-002-07, CA-002-08)', async () => {
    const owner = MOCK_CHARGE_IDS.ownerInReview;
    const inReview = await settle(getCharge(owner));
    fetchMock.mockClear();

    await settle(confirmCharge(owner, { version: inReview.version }));
    expect(fetchMock).toHaveBeenLastCalledWith(
      `/api/charges/${owner}/confirm`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ version: inReview.version }),
      }),
    );

    await settle(rejectCharge(owner, { reason: 'Monto distinto', invalidReceipt: true }));
    expect(fetchMock).toHaveBeenLastCalledWith(
      `/api/charges/${owner}/reject`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ reason: 'Monto distinto', invalidReceipt: true }),
      }),
    );
  });

  it('T030: pago en efectivo y cancelar salen por POST con su cuerpo (CA-002-14, CA-002-15)', async () => {
    const owner = MOCK_CHARGE_IDS.ownerOverdue;
    const current = await settle(getCharge(owner));
    fetchMock.mockClear();

    const paid = await settle(
      registerManualPayment(owner, { note: ' Entregó en mano ', version: current.version }),
    );
    expect(paid).toMatchObject({
      status: 'pagado',
      settlement: 'manual',
      manualNote: 'Entregó en mano',
    });
    expect(fetchMock).toHaveBeenLastCalledWith(
      `/api/charges/${owner}/manual-payment`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ note: ' Entregó en mano ', version: current.version }),
      }),
    );

    const cancelled = await settle(cancelCharge(owner, { reason: 'Se dio de baja' }));
    expect(cancelled).toMatchObject({ status: 'cancelado', cancelReason: 'Se dio de baja' });
    expect(fetchMock).toHaveBeenLastCalledWith(
      `/api/charges/${owner}/cancel`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ reason: 'Se dio de baja' }),
      }),
    );
  });

  it('T030: un cobro que no admite pago ni cancelación, o un motivo corto responden 409 y 400 (CA-002-14, CA-002-15)', async () => {
    await expectRejection(registerManualPayment(MOCK_CHARGE_IDS.ownerInReview), {
      statusCode: 409,
      code: 'INVALID_TRANSITION',
    });
    await expectRejection(cancelCharge(MOCK_CHARGE_IDS.ownerInReview, { reason: 'Motivo' }), {
      statusCode: 409,
      code: 'INVALID_TRANSITION',
    });
    await expectRejection(cancelCharge(MOCK_CHARGE_IDS.ownerInReviewOverdue, { reason: 'no' }), {
      statusCode: 400,
      code: 'VALIDATION_ERROR',
    });
  });

  it('T038: historial y resumen del grupo salen por GET al proxy con su query (CA-002-17, CA-002-18, CA-002-20)', async () => {
    const owner = MOCK_BILLING_GROUP_IDS.owner;
    fetchMock.mockClear();

    await settle(
      getGroupCharges(owner, { period: '2026-10', status: ['pagado', 'atrasado'], limit: 5 }),
    );
    expect(fetchMock).toHaveBeenLastCalledWith(
      `/api/groups/${owner}/charges?period=2026-10&status=pagado&status=atrasado&limit=5`,
      expect.objectContaining({ method: 'GET' }),
    );

    await settle(getBillingSummary(owner, '2026-09'));
    expect(fetchMock).toHaveBeenLastCalledWith(
      `/api/groups/${owner}/billing/summary?period=2026-09`,
      expect.anything(),
    );

    await settle(getBillingSummary(owner));
    expect(fetchMock.mock.calls[fetchMock.mock.calls.length - 1]?.[0]).toBe(
      `/api/groups/${owner}/billing/summary`,
    );
  });

  it('CA-002-19: un 409 STALE_STATE llega como ApiError con su código', async () => {
    const owner = MOCK_CHARGE_IDS.ownerInReview;
    await expectRejection(confirmCharge(owner, { version: 1 }), {
      statusCode: 409,
      code: 'STALE_STATE',
    });
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

describe('services/charges: subida y archivo conectados a la API (T023, contrato 002)', () => {
  const PENDING = MOCK_CHARGE_IDS.pendingRejected;

  function lastFormData(): FormData {
    const init = fetchMock.mock.calls.at(-1)?.[1] as RequestInit;
    expect(init.body).toBeInstanceOf(FormData);
    return init.body as FormData;
  }

  it('RF-002-06: el FormData lleva file, method, reference y version, y POST a la ruta del cobro', async () => {
    const file = new File(['x'], 'c.png', { type: 'image/png' });
    await settle(uploadReceipt(PENDING, { file, method: 'qr', reference: 'QR-7', version: 3 }));

    expect(fetchMock).toHaveBeenLastCalledWith(
      `/api/charges/${encodeURIComponent(PENDING)}/receipts`,
      expect.objectContaining({ method: 'POST', credentials: 'same-origin' }),
    );
    const form = lastFormData();
    expect(form.get('file')).toBe(file);
    expect(form.get('method')).toBe('qr');
    expect(form.get('reference')).toBe('QR-7');
    expect(form.get('version')).toBe('3');
  });

  it('RF-002-06: sin version el FormData no la incluye', async () => {
    const file = new File(['x'], 'c.pdf', { type: 'application/pdf' });
    await settle(uploadReceipt(PENDING, { file, method: 'transferencia', reference: 'TRX-1' }));
    const form = lastFormData();
    expect(form.has('version')).toBe(false);
    expect(form.get('method')).toBe('transferencia');
  });

  it('CA-002-04: un JPG de 2 MB se sube y el cobro queda en_revision con el comprobante vigente', async () => {
    const file = new File([new Uint8Array(2 * 1024 * 1024)], 'pago.jpg', { type: 'image/jpeg' });
    const charge = await settle(
      uploadReceipt(PENDING, { file, method: 'qr', reference: 'QR-2MB' }),
    );
    expect(charge).toMatchObject({
      status: 'en_revision',
      currentReceipt: { reference: 'QR-2MB', mime: 'image/jpeg', status: 'vigente' },
    });
    expect(charge.timeline.at(-1)).toMatchObject({ type: 'comprobante_subido' });
  });

  it('CA-002-05: un archivo de 6 MB responde 413 FILE_TOO_LARGE y un .exe responde 415', async () => {
    const big = new File([new Uint8Array(6 * 1024 * 1024)], 'grande.jpg', { type: 'image/jpeg' });
    await expectRejection(uploadReceipt(PENDING, { file: big, method: 'qr', reference: 'A1' }), {
      statusCode: 413,
      code: 'FILE_TOO_LARGE',
    });
    const exe = new File(['x'], 'virus.exe', { type: 'application/x-msdownload' });
    await expectRejection(uploadReceipt(PENDING, { file: exe, method: 'qr', reference: 'A2' }), {
      statusCode: 415,
      code: 'UNSUPPORTED_FILE_TYPE',
    });
  });

  it('CA-002-26: sin referencia el servidor rechaza con 400 y el cobro no cambia', async () => {
    const file = new File(['x'], 'c.png', { type: 'image/png' });
    await expectRejection(uploadReceipt(PENDING, { file, method: 'qr', reference: '   ' }), {
      statusCode: 400,
      code: 'VALIDATION_ERROR',
    });
    const after = await settle(getCharge(PENDING));
    expect(after.status).toBe('pendiente');
    expect(after.currentReceipt).toBeNull();
  });

  it('CA-002-27: una referencia repetida en el grupo responde 409 REFERENCE_ALREADY_USED', async () => {
    const file = new File(['x'], 'c.png', { type: 'image/png' });
    await expectRejection(
      uploadReceipt(PENDING, {
        file,
        method: 'qr',
        reference: MOCK_RECEIPT_REFERENCES.alreadyUsed,
      }),
      { statusCode: 409, code: 'REFERENCE_ALREADY_USED' },
    );
  });

  it('CA-002-11: subir a un cobro pagado responde 409 INVALID_TRANSITION', async () => {
    const file = new File(['x'], 'c.png', { type: 'image/png' });
    await expectRejection(
      uploadReceipt(MOCK_CHARGE_IDS.paid, { file, method: 'qr', reference: 'TARDE-1' }),
      { statusCode: 409, code: 'INVALID_TRANSITION' },
    );
  });

  it('RF-002-06: GET del archivo devuelve la URL firmada y 410 FILE_DELETED si ya se borró', async () => {
    const owner = await settle(getCharge(MOCK_CHARGE_IDS.ownerInReview));
    const signed = await settle(getReceiptFile(owner.id, owner.currentReceipt?.id ?? ''));
    expect(signed).toMatchObject({ url: expect.any(String), mime: expect.any(String) });
    expect(fetchMock).toHaveBeenLastCalledWith(
      `/api/charges/${encodeURIComponent(owner.id)}/receipts/${encodeURIComponent(
        owner.currentReceipt?.id ?? '',
      )}/file`,
      expect.objectContaining({ credentials: 'same-origin' }),
    );

    const overdue = await settle(getCharge(MOCK_CHARGE_IDS.ownerInReviewOverdue));
    await expectRejection(getReceiptFile(overdue.id, overdue.currentReceipt?.id ?? ''), {
      statusCode: 410,
      code: 'FILE_DELETED',
    });
  });
});
