import { BillingHarness, type TestGroup } from './support/billing-harness.js';
import { uploadReceipt } from './support/receipt-files.js';
import { PaymentReferenceService } from '../src/modules/billing/services/payment-reference.service.js';
import { DbService } from '../src/shared/db/db.service.js';

// Referencia de pago única por grupo (spec 002, RF-002-07, T020) contra PostgreSQL real.
describe('Referencia única de los comprobantes', () => {
  const harness = new BillingHarness();
  let group: TestGroup;
  let memberA: string;
  let memberB: string;
  let chargeA: string;
  let chargeB: string;

  beforeAll(async () => {
    await harness.start();
  }, 60_000);

  afterAll(async () => {
    await harness.stop();
  }, 30_000);

  beforeEach(async () => {
    group = await harness.createGroup({ members: 2 });
    [memberA, memberB] = group.memberIds as [string, string];
    chargeA = await harness.insertCharge(group, memberA);
    chargeB = await harness.insertCharge(group, memberB);
    harness.storage.files.clear();
  });

  const statusOf = async (id: string): Promise<string> =>
    (await harness.pool.query<{ status: string }>('SELECT status FROM charges WHERE id = $1', [id]))
      .rows[0]?.status as string;

  it('CA-002-27: una referencia ya usada en el mismo grupo se rechaza con 409 REFERENCE_ALREADY_USED', async () => {
    await uploadReceipt(harness, memberA, chargeA, { reference: 'TX-777' }).expect(201);
    const filesBefore = harness.storage.files.size;

    const response = await uploadReceipt(harness, memberB, chargeB, { reference: 'TX-777' }).expect(
      409,
    );

    expect(response.body).toMatchObject({
      statusCode: 409,
      code: 'REFERENCE_ALREADY_USED',
      details: { rule: 'RN-010-14' },
    });
    expect(await statusOf(chargeB)).toBe('pendiente');
    expect(harness.storage.files.size).toBe(filesBefore);
  });

  it('CA-002-27: la comparación ignora mayúsculas y espacios repetidos', async () => {
    await uploadReceipt(harness, memberA, chargeA, { reference: 'tx  777' }).expect(201);
    await uploadReceipt(harness, memberB, chargeB, { reference: ' TX 777 ' }).expect(409);
  });

  it('CA-002-27: A-001 y A001 son referencias distintas', async () => {
    await uploadReceipt(harness, memberA, chargeA, { reference: 'A-001' }).expect(201);
    await uploadReceipt(harness, memberB, chargeB, { reference: 'A001' }).expect(201);
  });

  it('CA-002-27: tras rechazar el comprobante, la referencia se libera y se puede usar', async () => {
    await uploadReceipt(harness, memberA, chargeA, { reference: 'TX-888' }).expect(201);
    // Lo que hará el rechazo del titular (T025): comprobante rechazado, referencia liberada y
    // cobro de nuevo abierto.
    const references = harness.app.get(PaymentReferenceService);
    const db = harness.app.get(DbService);
    const receipt = await harness.pool.query<{ id: string }>(
      'SELECT id FROM receipts WHERE charge_id = $1',
      [chargeA],
    );
    const receiptId = receipt.rows[0]?.id as string;
    await db.withTransaction(async (tx) => {
      await tx.query("UPDATE receipts SET status = 'rechazado' WHERE id = $1", [receiptId]);
      await references.release(tx, 'receipt', receiptId, harness.clock.now());
    });
    await harness.pool.query("UPDATE charges SET status = 'pendiente' WHERE id = $1", [chargeA]);

    await uploadReceipt(harness, memberB, chargeB, { reference: 'TX-888' }).expect(201);
  });

  it('CA-002-27: la misma referencia en otro grupo sí se acepta', async () => {
    const otherGroup = await harness.createGroup({ members: 1 });
    const foreignCharge = await harness.insertCharge(otherGroup, otherGroup.memberIds[0] as string);
    await uploadReceipt(harness, memberA, chargeA, { reference: 'TX-999' }).expect(201);

    await uploadReceipt(harness, otherGroup.memberIds[0] as string, foreignCharge, {
      reference: 'TX-999',
    }).expect(201);
  });

  it('CA-002-27: dos subidas simultáneas con la misma referencia: una gana y la otra no deja archivo', async () => {
    const results = await Promise.all([
      uploadReceipt(harness, memberA, chargeA, { reference: 'CARRERA-1' }),
      uploadReceipt(harness, memberB, chargeB, { reference: 'CARRERA-1' }),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(harness.storage.files.size).toBe(1);
    const states = [await statusOf(chargeA), await statusOf(chargeB)].sort();
    expect(states).toEqual(['en_revision', 'pendiente']);
  });
});
