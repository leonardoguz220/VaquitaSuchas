import request from 'supertest';
import { BillingHarness } from './support/billing-harness.js';
import { jpegBytes, pdfBytes, pngBytes } from './support/receipt-files.js';

// Datos de pago del titular (spec 001 T015): PUT /groups/:id/payment-info contra PostgreSQL real.
describe('Datos de pago del grupo', () => {
  const harness = new BillingHarness();
  const http = (): ReturnType<typeof request> => request(harness.app.getHttpServer());
  const bearer = (userId: string): string => `Bearer ${harness.token(userId)}`;

  const put = (
    userId: string,
    groupId: string,
    fields: { text?: string; removeQr?: string } = {},
    qr?: { bytes: Buffer; filename?: string },
  ): request.Test => {
    let call = http().put(`/groups/${groupId}/payment-info`).set('Authorization', bearer(userId));
    if (fields.text !== undefined) call = call.field('text', fields.text);
    if (fields.removeQr !== undefined) call = call.field('removeQr', fields.removeQr);
    if (qr) call = call.attach('qr', qr.bytes, { filename: qr.filename ?? 'qr.png' });
    return call;
  };

  const qrKey = async (groupId: string): Promise<string | null> =>
    (
      await harness.pool.query<{ k: string | null }>(
        'SELECT payment_qr_key AS k FROM groups WHERE id = $1',
        [groupId],
      )
    ).rows[0]?.k ?? null;

  beforeAll(() => harness.start(), 60_000);
  afterAll(() => harness.stop(), 30_000);

  it('CA-001-23: el titular guarda texto y QR y el miembro ve ambos con URL de 10 minutos', async () => {
    const group = await harness.createGroup({ members: 1 });
    const member = group.memberIds[0] as string;

    const response = await put(
      group.ownerId,
      group.id,
      { text: '  Banco X, cuenta 123  ' },
      { bytes: pngBytes() },
    ).expect(200);

    expect(response.body.paymentInfo).toMatchObject({
      text: 'Banco X, cuenta 123',
      configured: true,
    });
    expect(response.body.paymentInfo.qrUrl).toContain('ttl=600');
    const key = await qrKey(group.id);
    expect(key).toMatch(new RegExp(`^groups/${group.id}/qr/[0-9a-f-]{36}\\.png$`));
    expect(await harness.storage.exists(key as string)).toBe(true);

    const detail = await http()
      .get(`/groups/${group.id}`)
      .set('Authorization', bearer(member))
      .expect(200);
    expect(detail.body.paymentInfo).toMatchObject({
      text: 'Banco X, cuenta 123',
      configured: true,
    });
    expect(detail.body.paymentInfo.qrUrl).toContain(String(key));
  });

  it('CA-001-23: sin datos de pago el miembro ve configured en false', async () => {
    const group = await harness.createGroup({ members: 1 });
    await harness.pool.query('UPDATE groups SET payment_info_text = NULL WHERE id = $1', [
      group.id,
    ]);

    const detail = await http()
      .get(`/groups/${group.id}`)
      .set('Authorization', bearer(group.memberIds[0] as string))
      .expect(200);

    expect(detail.body.paymentInfo).toEqual({ text: null, qrUrl: null, configured: false });
  });

  it('CA-001-23: reemplazar el QR borra el anterior y quitarlo deja el grupo sin imagen', async () => {
    const group = await harness.createGroup({ members: 1 });
    await put(group.ownerId, group.id, {}, { bytes: pngBytes() }).expect(200);
    const first = (await qrKey(group.id)) as string;

    await put(group.ownerId, group.id, {}, { bytes: jpegBytes(2048), filename: 'qr.jpg' }).expect(
      200,
    );
    const second = (await qrKey(group.id)) as string;
    expect(second).toMatch(/\.jpg$/);
    expect(second).not.toBe(first);
    expect(await harness.storage.exists(first)).toBe(false);

    const removed = await put(group.ownerId, group.id, { removeQr: 'true' }).expect(200);
    expect(removed.body.paymentInfo.qrUrl).toBeNull();
    expect(await qrKey(group.id)).toBeNull();
    expect(await harness.storage.exists(second)).toBe(false);
  });

  it('CA-001-23: un PDF se rechaza con 415 y se conserva el QR anterior', async () => {
    const group = await harness.createGroup({ members: 1 });
    await put(group.ownerId, group.id, {}, { bytes: pngBytes() }).expect(200);
    const before = await qrKey(group.id);

    const response = await put(
      group.ownerId,
      group.id,
      { text: 'nuevo' },
      { bytes: pdfBytes(), filename: 'qr.png' },
    ).expect(415);

    expect(response.body).toMatchObject({ code: 'UNSUPPORTED_FILE_TYPE' });
    expect(await qrKey(group.id)).toBe(before);
    expect(await harness.storage.exists(before as string)).toBe(true);
  });

  it('CA-001-23: un QR de más de 2 MB responde 413 y un texto de 501 caracteres 400', async () => {
    const group = await harness.createGroup({ members: 1 });

    const big = await put(
      group.ownerId,
      group.id,
      {},
      { bytes: pngBytes(2 * 1024 * 1024 + 1) },
    ).expect(413);
    expect(big.body).toMatchObject({ code: 'FILE_TOO_LARGE' });
    expect(await qrKey(group.id)).toBeNull();

    const long = await put(group.ownerId, group.id, { text: 'a'.repeat(501) }).expect(400);
    expect(long.body).toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('CA-001-23: si el almacén falla responde 503 y conserva el QR anterior', async () => {
    const group = await harness.createGroup({ members: 1 });
    await put(group.ownerId, group.id, {}, { bytes: pngBytes() }).expect(200);
    const before = await qrKey(group.id);

    harness.storage.failPut = true;
    try {
      await put(group.ownerId, group.id, {}, { bytes: jpegBytes(1024) }).expect(503);
    } finally {
      harness.storage.failPut = false;
    }

    expect(await qrKey(group.id)).toBe(before);
  });

  it('CA-001-11: un miembro recibe 403, un ajeno 404 y un grupo congelado 422', async () => {
    const group = await harness.createGroup({ members: 1 });
    const outsider = await harness.insertUser();

    await put(group.memberIds[0] as string, group.id, { text: 'x' }).expect(403);
    await put(outsider, group.id, { text: 'x' }).expect(404);
    await http().put(`/groups/${group.id}/payment-info`).expect(401);

    await harness.freezeGroup(group.id);
    const frozen = await put(group.ownerId, group.id, { text: 'x' }).expect(422);
    expect(frozen.body).toMatchObject({ code: 'GROUP_FROZEN' });
  });
});
