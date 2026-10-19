import { jest } from '@jest/globals';
import { Logger } from '@nestjs/common';
import request from 'supertest';
import { GroupsRepository } from '../src/modules/subscriptions/repositories/groups.repository.js';
import { BillingHarness, type TestGroup } from './support/billing-harness.js';
import { exeBytes, jpegBytes, pdfBytes, pngBytes } from './support/receipt-files.js';

// Datos de pago del grupo (spec 001 T015): PUT /groups/:id/payment-info contra PostgreSQL real
// y con el almacén en memoria.
describe('Datos de pago del grupo', () => {
  const harness = new BillingHarness();
  let group: TestGroup;

  const http = (): ReturnType<typeof request> => request(harness.app.getHttpServer());
  const put = (
    userId: string,
    groupId: string,
    fields: { text?: string; qr?: Buffer; filename?: string; removeQr?: string } = {},
  ): request.Test => {
    let call = http()
      .put(`/groups/${groupId}/payment-info`)
      .set('Authorization', `Bearer ${harness.token(userId)}`);
    if (fields.text !== undefined) call = call.field('text', fields.text);
    if (fields.removeQr !== undefined) call = call.field('removeQr', fields.removeQr);
    if (fields.qr)
      call = call.attach('qr', fields.qr, { filename: fields.filename ?? 'mi-qr.png' });
    return call;
  };
  const getDetail = (userId: string, groupId: string): request.Test =>
    http()
      .get(`/groups/${groupId}`)
      .set('Authorization', `Bearer ${harness.token(userId)}`);
  const stored = async (groupId = group.id): Promise<Record<string, unknown>> =>
    (
      await harness.pool.query(
        'SELECT payment_info_text, payment_qr_key, payment_qr_mime, version FROM groups WHERE id = $1',
        [groupId],
      )
    ).rows[0];

  beforeAll(() => harness.start(), 60_000);
  afterAll(() => harness.stop(), 30_000);
  beforeEach(async () => {
    group = await harness.createGroup({ members: 2 });
    // El grupo de prueba trae un texto de pago; aquí parte sin datos de pago.
    await harness.pool.query('UPDATE groups SET payment_info_text = NULL WHERE id = $1', [
      group.id,
    ]);
    harness.storage.files.clear();
    harness.storage.deleted.length = 0;
    harness.storage.failPut = false;
    harness.storage.failSignedUrl = false;
  });
  afterEach(() => {
    jest.restoreAllMocks();
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  it('CA-001-23 y RF-001-20: el titular guarda texto y QR; el QR queda con clave generada y tipo real', async () => {
    const response = await put(group.ownerId, group.id, {
      text: '  Banco X, cuenta 123  ',
      qr: pngBytes(),
      filename: 'foto-privada.png',
    }).expect(200);

    expect(response.body.paymentInfo).toMatchObject({
      text: 'Banco X, cuenta 123',
      configured: true,
    });
    expect(response.body.paymentInfo.qrUrl).toContain('ttl=600');
    const row = await stored();
    expect(row['payment_qr_key']).toMatch(
      new RegExp(`^groups/${group.id}/qr/[0-9a-f-]{36}\\.png$`),
    );
    expect(row['payment_qr_mime']).toBe('image/png');
    expect(row['payment_info_text']).toBe('Banco X, cuenta 123');
    const file = harness.storage.files.get(row['payment_qr_key'] as string);
    expect(file?.contentType).toBe('image/png');
    expect(String(row['payment_qr_key'])).not.toContain('foto-privada');
  });

  it('RF-001-20: un JPG se guarda como image/jpeg con extensión jpg', async () => {
    await put(group.ownerId, group.id, { qr: jpegBytes(1024), filename: 'qr.png' }).expect(200);
    const row = await stored();
    expect(row['payment_qr_key']).toMatch(/\.jpg$/);
    expect(row['payment_qr_mime']).toBe('image/jpeg');
  });

  it('CA-001-23: un miembro ve texto y QR firmado de 10 min al consultar el grupo; sin configurar ve configured=false', async () => {
    const [member] = group.memberIds as [string];
    const before = await getDetail(member, group.id).expect(200);
    expect(before.body.paymentInfo).toEqual({ text: null, qrUrl: null, configured: false });

    await put(group.ownerId, group.id, { text: 'Cuenta 9', qr: pngBytes() }).expect(200);
    const after = await getDetail(member, group.id).expect(200);
    expect(after.body.paymentInfo.text).toBe('Cuenta 9');
    expect(after.body.paymentInfo.qrUrl).toContain('ttl=600');
    expect(after.body.paymentInfo.configured).toBe(true);
  });

  it('RF-001-20: si el almacén falla al firmar, el detalle responde igual con qrUrl null y configured true', async () => {
    await put(group.ownerId, group.id, { qr: pngBytes() }).expect(200);
    harness.storage.failSignedUrl = true;
    const detail = await getDetail(group.ownerId, group.id).expect(200);
    expect(detail.body.paymentInfo).toEqual({ text: null, qrUrl: null, configured: true });
  });

  it('RF-001-20: la firma binaria manda; un ejecutable o un PDF llamados .png dan 415 y se conserva el QR anterior', async () => {
    await put(group.ownerId, group.id, { qr: pngBytes() }).expect(200);
    const before = await stored();
    const filesBefore = harness.storage.files.size;

    const exe = await put(group.ownerId, group.id, { qr: exeBytes(), filename: 'qr.png' }).expect(
      415,
    );
    expect(exe.body.code).toBe('UNSUPPORTED_FILE_TYPE');
    await put(group.ownerId, group.id, { qr: pdfBytes(), filename: 'qr.jpg' }).expect(415);

    expect(await stored()).toEqual(before);
    expect(harness.storage.files.size).toBe(filesBefore);
    expect(harness.storage.deleted).toEqual([]);
  });

  it('RF-001-20: más de 2 MB da 413 FILE_TOO_LARGE y conserva el QR anterior', async () => {
    await put(group.ownerId, group.id, { qr: pngBytes() }).expect(200);
    const before = await stored();

    const big = await put(group.ownerId, group.id, { qr: pngBytes(2 * 1024 * 1024 + 1) }).expect(
      413,
    );
    expect(big.body.code).toBe('FILE_TOO_LARGE');
    expect(await stored()).toEqual(before);
    // Exactamente 2 MB sí se acepta.
    await put(group.ownerId, group.id, { qr: pngBytes(2 * 1024 * 1024) }).expect(200);
  });

  it('RF-001-20: texto de más de 500 caracteres da 400 y no cambia nada; 500 se acepta', async () => {
    await put(group.ownerId, group.id, { text: 'inicial', qr: pngBytes() }).expect(200);
    const before = await stored();
    const response = await put(group.ownerId, group.id, { text: 'a'.repeat(501) }).expect(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
    expect(await stored()).toEqual(before);
    await put(group.ownerId, group.id, { text: 'a'.repeat(500) }).expect(200);
  });

  it('RF-001-20: reemplazar el QR guarda el nuevo y borra el anterior solo tras confirmar', async () => {
    await put(group.ownerId, group.id, { qr: pngBytes() }).expect(200);
    const oldKey = (await stored())['payment_qr_key'] as string;

    await put(group.ownerId, group.id, { qr: jpegBytes(2048) }).expect(200);
    const newKey = (await stored())['payment_qr_key'] as string;
    expect(newKey).not.toBe(oldKey);
    expect(harness.storage.files.has(newKey)).toBe(true);
    expect(harness.storage.files.has(oldKey)).toBe(false);
    expect(harness.storage.deleted).toEqual([oldKey]);
  });

  it('RF-001-20: sin QR en la petición se conserva el QR vigente; cambiar solo el texto no lo borra', async () => {
    await put(group.ownerId, group.id, { text: 'uno', qr: pngBytes() }).expect(200);
    const key = (await stored())['payment_qr_key'];
    await put(group.ownerId, group.id, { text: 'dos' }).expect(200);
    expect(await stored()).toMatchObject({ payment_info_text: 'dos', payment_qr_key: key });
    expect(harness.storage.deleted).toEqual([]);
  });

  it('RF-001-20: un texto vacío borra el texto', async () => {
    await put(group.ownerId, group.id, { text: 'algo' }).expect(200);
    const response = await put(group.ownerId, group.id, { text: '' }).expect(200);
    expect(response.body.paymentInfo).toEqual({ text: null, qrUrl: null, configured: false });
  });

  it('RF-001-20: removeQr=true borra la imagen y el archivo; con un QR nuevo a la vez es 400', async () => {
    await put(group.ownerId, group.id, { text: 'queda', qr: pngBytes() }).expect(200);
    const key = (await stored())['payment_qr_key'] as string;

    await put(group.ownerId, group.id, { removeQr: 'true', qr: pngBytes() }).expect(400);
    expect(await stored()).toMatchObject({ payment_qr_key: key });

    const response = await put(group.ownerId, group.id, { removeQr: 'true' }).expect(200);
    expect(response.body.paymentInfo).toEqual({ text: 'queda', qrUrl: null, configured: true });
    expect(await stored()).toMatchObject({ payment_qr_key: null, payment_qr_mime: null });
    expect(harness.storage.deleted).toEqual([key]);
  });

  it('RF-001-20: si el almacén falla al guardar responde 503 y conserva el QR anterior', async () => {
    await put(group.ownerId, group.id, { text: 'uno', qr: pngBytes() }).expect(200);
    const before = await stored();
    harness.storage.failPut = true;
    const response = await put(group.ownerId, group.id, { text: 'dos', qr: jpegBytes(64) }).expect(
      503,
    );
    expect(response.body.code).toBe('SERVICE_UNAVAILABLE');
    expect(await stored()).toEqual(before);
    expect(harness.storage.deleted).toEqual([]);
  });

  it('RF-001-20: si falla la base tras guardar el archivo, se borra el nuevo y se conserva el anterior', async () => {
    await put(group.ownerId, group.id, { qr: pngBytes() }).expect(200);
    const before = await stored();
    const oldKey = before['payment_qr_key'] as string;
    const filesBefore = new Set(harness.storage.files.keys());
    jest
      .spyOn(harness.app.get(GroupsRepository), 'updatePaymentInfo')
      .mockRejectedValueOnce(new Error('falla simulada'));

    await put(group.ownerId, group.id, { qr: jpegBytes(64) }).expect(500);

    expect(await stored()).toEqual(before);
    expect(new Set(harness.storage.files.keys())).toEqual(filesBefore);
    expect(harness.storage.files.has(oldKey)).toBe(true);
    expect(harness.storage.deleted).toHaveLength(1);
    expect(harness.storage.deleted).not.toContain(oldKey);
  });

  it('CA-001-11: un miembro que no es titular recibe 403 y no cambia nada', async () => {
    const [member] = group.memberIds as [string];
    const before = await stored();
    await put(member, group.id, { text: 'hackeo', qr: pngBytes() }).expect(403);
    expect(await stored()).toEqual(before);
    expect(harness.storage.files.size).toBe(0);
  });

  it('CA-001-10: quien no es miembro recibe 404', async () => {
    const stranger = await harness.insertUser();
    await put(stranger, group.id, { text: 'x' }).expect(404);
    await http().put(`/groups/${group.id}/payment-info`).expect(401);
  });

  it('RN-001-07: un grupo cerrado responde GROUP_CLOSED y no deja archivos huérfanos', async () => {
    await harness.pool.query(
      `UPDATE groups SET status = 'cerrado', closed_at = now() WHERE id = $1`,
      [group.id],
    );
    const response = await put(group.ownerId, group.id, { qr: pngBytes() }).expect(422);
    expect(response.body.code).toBe('GROUP_CLOSED');
    expect(harness.storage.files.size).toBe(0);
  });

  it('RF-009-22: un grupo congelado responde GROUP_FROZEN', async () => {
    await harness.freezeGroup(group.id);
    const response = await put(group.ownerId, group.id, { text: 'x' }).expect(422);
    expect(response.body.code).toBe('GROUP_FROZEN');
  });

  it('RF-001-20 y CLAUDE.md §5: los registros no incluyen claves de archivo ni URLs firmadas', async () => {
    const lines: string[] = [];
    const capture = (message: unknown): void => {
      lines.push(String(message));
    };
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(capture);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(capture);
    await put(group.ownerId, group.id, { qr: pngBytes() }).expect(200);
    harness.storage.failSignedUrl = true;
    await getDetail(group.ownerId, group.id).expect(200);
    harness.storage.failSignedUrl = false;
    harness.storage.failPut = true;
    await put(group.ownerId, group.id, { qr: pngBytes() }).expect(503);

    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(line).not.toMatch(/groups\/|storage\.test|\.png|\.jpg|mi-qr/);
    }
  });
});
