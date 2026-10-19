import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { BillingHarness, type TestGroup } from './support/billing-harness.js';

// Permisos de lectura de cobros y comprobantes (spec 002, US1, T016) contra PostgreSQL real. Sigue
// la tabla de acceso de plan §7 y de contracts/api.md: titular y dueño ven todo; otro miembro
// recibe 403; quien no pertenece al grupo recibe 404.
describe('Permisos de cobros y comprobantes', () => {
  const harness = new BillingHarness();
  let group: TestGroup;
  let ownerId: string;
  let memberA: string; // dueño del cobro
  let memberB: string; // otro miembro del grupo
  let stranger: string;
  let chargeId: string;
  let receiptId: string;

  const get = (userId: string, url: string): request.Test =>
    request(harness.app.getHttpServer())
      .get(url)
      .set('Authorization', `Bearer ${harness.token(userId)}`);

  beforeAll(async () => {
    await harness.start();
    group = await harness.createGroup({ members: 2, ownerName: 'Titular Suchas' });
    ownerId = group.ownerId;
    [memberA, memberB] = group.memberIds as [string, string];
    stranger = await harness.insertUser();
    chargeId = await harness.insertCharge(group, memberA);
    const receipt = await harness.insertReceipt(chargeId, memberA, { reference: 'SECRETA-77' });
    receiptId = receipt.id;
  }, 60_000);

  afterAll(async () => {
    await harness.stop();
  }, 30_000);

  it('RNF-002-01: sin sesión responde 401 en el detalle y en el comprobante', async () => {
    await request(harness.app.getHttpServer()).get(`/charges/${chargeId}`).expect(401);
    await request(harness.app.getHttpServer())
      .get(`/charges/${chargeId}/receipts/${receiptId}/file`)
      .expect(401);
    await request(harness.app.getHttpServer()).get('/me/charges').expect(401);
  });

  it('CA-002-23: una persona ajena al grupo recibe 404 en el cobro', async () => {
    const response = await get(stranger, `/charges/${chargeId}`).expect(404);
    expect(response.body).toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
  });

  it('CA-002-23: una persona ajena al grupo recibe 404 en el comprobante', async () => {
    const response = await get(stranger, `/charges/${chargeId}/receipts/${receiptId}/file`).expect(
      404,
    );
    expect(response.body).toMatchObject({ code: 'NOT_FOUND' });
  });

  it('CA-002-23: un cobro inexistente o un identificador mal formado también dan 404', async () => {
    await get(memberA, `/charges/${randomUUID()}`).expect(404);
    await get(memberA, '/charges/no-es-un-uuid').expect(404);
    await get(memberA, `/charges/${chargeId}/receipts/${randomUUID()}/file`).expect(404);
  });

  it('CA-002-13: otro miembro del grupo recibe 403 al ver el cobro de otro', async () => {
    const response = await get(memberB, `/charges/${chargeId}`).expect(403);
    expect(response.body).toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
    expect(JSON.stringify(response.body)).not.toContain('SECRETA-77');
  });

  it('CA-002-13: otro miembro del grupo recibe 403 al ver el comprobante de otro', async () => {
    const response = await get(memberB, `/charges/${chargeId}/receipts/${receiptId}/file`).expect(
      403,
    );
    expect(response.body).toMatchObject({ code: 'FORBIDDEN' });
    expect(harness.storage.files.size).toBeGreaterThan(0);
  });

  it('RNF-002-07: el cobro de otro miembro no aparece en "Mis cobros" de quien no es su dueño', async () => {
    const mine = await get(memberB, '/me/charges').expect(200);
    expect(mine.body.items).toEqual([]);
    const owner = await get(ownerId, '/me/charges').expect(200);
    expect(owner.body.items).toEqual([]);
  });

  it('RNF-002-01: el dueño ve su cobro completo, con su referencia', async () => {
    const response = await get(memberA, `/charges/${chargeId}`).expect(200);
    expect(response.body).toMatchObject({
      id: chargeId,
      amountCents: 3333,
      status: 'pendiente',
      member: { userId: memberA, isFormerMember: false },
    });
    expect(response.body.receipts[0]).toMatchObject({ id: receiptId, reference: 'SECRETA-77' });
  });

  it('RNF-002-01: el titular ve el cobro completo y el comprobante de un miembro', async () => {
    const detail = await get(ownerId, `/charges/${chargeId}`).expect(200);
    expect(detail.body).toMatchObject({ id: chargeId, member: { userId: memberA } });
    const file = await get(ownerId, `/charges/${chargeId}/receipts/${receiptId}/file`).expect(200);
    expect(file.body).toMatchObject({ mime: 'image/png' });
    expect(typeof file.body.url).toBe('string');
  });

  it('CA-002-12: el dueño nunca recibe confirm ni reject entre sus acciones permitidas', async () => {
    const reviewing = await harness.insertCharge(group, memberB, { status: 'en_revision' });
    const asOwner = await get(memberB, `/charges/${reviewing}`).expect(200);
    expect(asOwner.body.allowedActions).not.toContain('confirm');
    expect(asOwner.body.allowedActions).not.toContain('reject');
    const asTitular = await get(ownerId, `/charges/${reviewing}`).expect(200);
    expect(asTitular.body.allowedActions).toEqual(['confirm', 'reject']);
  });

  // El endpoint POST /charges/:id/confirm llega con T025; hasta entonces el 403 del dueño que
  // confirma su propio cobro no se puede probar por HTTP. Lo cubre allowedActions (arriba) y la
  // función de dominio `allowedActions` (access.spec.ts).
  it.todo('CA-002-12: POST /charges/:id/confirm del dueño responde 403 (se activa con T025)');

  it('RF-002-09: el titular no recibe el bloque de datos de pago en el cobro de un miembro', async () => {
    const asTitular = await get(ownerId, `/charges/${chargeId}`).expect(200);
    expect(asTitular.body.paymentInfo).toBeNull();
  });
});
