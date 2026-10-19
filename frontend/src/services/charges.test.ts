import {
  confirmCharge,
  getBillingSummary,
  getCharge,
  getGroupCharges,
  getReceiptFile,
  listMyCharges,
  uploadReceipt,
} from './charges';
import { MOCK_CHARGE_IDS } from './charges.mock';

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
});
