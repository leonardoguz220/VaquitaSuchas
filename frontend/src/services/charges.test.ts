import {
  confirmCharge,
  getBillingSummary,
  getCharge,
  getGroupCharges,
  getReceiptFile,
  listMyCharges,
  uploadReceipt,
} from './charges';
import { MOCK_CHARGE_IDS, MOCK_RECEIPT_REFERENCES } from './charges.mock';
import { MOCK_BILLING_GROUP_IDS } from './group-billing.mock';

const SPOTIFY_GROUP_ID = '5b0d7c3e-0000-4000-8000-000000000103';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

async function settle<T>(promise: Promise<T>): Promise<T> {
  await jest.runAllTimersAsync();
  return promise;
}

async function expectRejection(promise: Promise<unknown>, shape: object) {
  const assertion = expect(promise).rejects.toMatchObject(shape);
  await jest.runAllTimersAsync();
  await assertion;
}

describe('services/charges con datos simulados (T018, contrato 002)', () => {
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
      code: 'INVALID_TRANSITION',
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
