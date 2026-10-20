import { jest } from '@jest/globals';
import { Logger } from '@nestjs/common';
import request from 'supertest';
import { BillingHarness, NOW, type TestGroup } from './support/billing-harness.js';
import { seedFinalRequest } from './support/disputes-fixtures.js';
import { seedRequest, setClock } from './support/join-requests-fixtures.js';
import { JoinRequestsModule } from '../src/modules/join-requests/join-requests.module.js';
import { jpegBytes, pdfBytes, pngBytes } from './support/receipt-files.js';

// Revisión de seguridad de la spec 010 (T045; RNF-010-01, RNF-010-02, RNF-010-08; plan §7).
describe('Seguridad de solicitudes de ingreso, chat y reclamos', () => {
  const harness = new BillingHarness({ imports: [JoinRequestsModule] });
  let group: TestGroup;
  let applicant: string;
  let admin: string;

  const http = (): ReturnType<typeof request> => request(harness.app.getHttpServer());
  const as = (test: request.Test, userId: string): request.Test =>
    test.set('Authorization', `Bearer ${harness.token(userId)}`);

  beforeAll(() => harness.start(), 60_000);
  afterAll(() => harness.stop(), 30_000);
  beforeEach(async () => {
    group = await harness.createGroup({ members: 1 });
    applicant = await harness.insertUser();
    admin = await harness.insertUser('Admin');
    await harness.pool.query(`UPDATE users SET role = 'admin' WHERE id = $1`, [admin]);
    harness.storage.files.clear();
    harness.storage.failPut = false;
  });
  afterEach(() => {
    setClock(harness, NOW);
    jest.restoreAllMocks();
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  it('RNF-010-01 (plan §7): el administrador no accede a solicitud, chat ni reclamos por las rutas de las partes (404)', async () => {
    const id = await seedFinalRequest(harness, group, applicant, 'rechazada');
    const created = await as(http().post(`/join-requests/${id}/disputes`), applicant)
      .field('description', 'Descripción del reclamo para el equipo')
      .expect(201);
    await as(http().get(`/join-requests/${id}`), admin).expect(404);
    await as(http().get(`/join-requests/${id}/messages`), admin).expect(404);
    await as(http().get(`/join-requests/${id}/disputes`), admin).expect(404);
    await as(http().post(`/join-requests/${id}/disputes`), admin)
      .field('description', 'Descripción del reclamo para el equipo')
      .expect(404);
    await as(http().post(`/join-requests/${id}/disputes/${created.body.id}/response`), admin)
      .field('text', 'Respuesta de la persona administradora')
      .expect(404);
  });

  it('RNF-010-01 (plan §7): abrir reclamo: solicitante solo pago_sin_ingreso, titular solo comprobante_falso; otro miembro 403, ajeno 404', async () => {
    const plain = await seedFinalRequest(harness, group, applicant, 'rechazada');
    const falso = await seedFinalRequest(
      harness,
      group,
      await harness.insertUser(),
      'rechazada_falso',
    );
    const text = 'Descripción del reclamo para el equipo';
    const openAs = (userId: string, id: string): request.Test =>
      as(http().post(`/join-requests/${id}/disputes`), userId).field('description', text);
    await openAs(group.ownerId, plain).expect(422); // el titular no reclama pago sin ingreso
    await openAs(applicant, falso).expect(404); // ajeno a esa solicitud
    await openAs(group.memberIds[0] as string, plain).expect(403);
    await openAs(await harness.insertUser(), plain).expect(404);
    const mine = await openAs(applicant, plain).expect(201);
    expect(mine.body.kind).toBe('pago_sin_ingreso');
    const hostFalse = await openAs(group.ownerId, falso).expect(201);
    expect(hostFalse.body.kind).toBe('comprobante_falso');
  });

  it('RNF-010-01: el cliente no envía montos, plazos ni tiempos; los campos extra se rechazan (400)', async () => {
    const pay = await seedRequest(harness, group, applicant, 'abierta');
    await as(http().post(`/join-requests/${pay}/payment-data`), group.ownerId)
      .field('text', 'Cuenta 123')
      .field('amountCents', '1')
      .expect(400);
    await as(http().post(`/join-requests/${pay}/payment-data`), group.ownerId)
      .field('payDeadlineAt', NOW)
      .expect(400);
    await as(http().post(`/join-requests/${pay}/messages`), applicant)
      .field('text', 'hola')
      .field('createdAt', NOW)
      .field('senderId', group.ownerId)
      .expect(400);
    const rows = await harness.pool.query('SELECT 1 FROM join_messages WHERE request_id = $1', [
      pay,
    ]);
    expect(rows.rowCount).toBe(0);
  });

  it('RNF-010-02: el chat valida la firma binaria, no el nombre ni el tipo declarado', async () => {
    const id = await seedRequest(harness, group, applicant, 'esperando_pago');
    const send = (bytes: Buffer, filename: string, contentType: string): request.Test =>
      as(http().post(`/join-requests/${id}/messages`), applicant).attach('image', bytes, {
        filename,
        contentType,
      });
    await send(pdfBytes(), 'foto.jpg', 'image/jpeg').expect(415);
    await send(pdfBytes(), 'doc.pdf', 'application/pdf').expect(415);
    expect(harness.storage.files.size).toBe(0);
    const ok = await send(pngBytes(), '../../etc/passwd.png', 'image/png').expect(201);
    expect(ok.body.imageAvailable).toBe(true);
    const [key] = [...harness.storage.files.keys()];
    expect(key).toMatch(/^join-requests\/[0-9a-f-]+\/[0-9a-f-]+\/chat-[0-9a-f-]+\.png$/);
  });

  it('RNF-010-02: las URL firmadas del chat y de la evidencia son de 10 minutos como máximo', async () => {
    const id = await seedRequest(harness, group, applicant, 'esperando_pago');
    const spy = jest.spyOn(harness.storage, 'signedUrl');
    const sent = await as(http().post(`/join-requests/${id}/messages`), applicant)
      .attach('image', jpegBytes(1024), { filename: 'a.jpg' })
      .expect(201);
    const signed = await as(
      http().get(`/join-requests/${id}/messages/${sent.body.id}/image`),
      group.ownerId,
    ).expect(200);
    expect(Date.parse(signed.body.expiresAt) - Date.parse(NOW)).toBeLessThanOrEqual(600_000);
    // Otro miembro y un ajeno no obtienen la imagen.
    await as(
      http().get(`/join-requests/${id}/messages/${sent.body.id}/image`),
      group.memberIds[0] as string,
    ).expect(403);
    await as(
      http().get(`/join-requests/${id}/messages/${sent.body.id}/image`),
      await harness.insertUser(),
    ).expect(404);
    for (const [, ttl] of spy.mock.calls) expect(ttl).toBeLessThanOrEqual(600);
  });

  it('RNF-010-02: las respuestas de la solicitud, el chat y los reclamos no exponen claves del almacén', async () => {
    const id = await seedFinalRequest(harness, group, applicant, 'rechazada');
    await as(http().post(`/join-requests/${id}/disputes`), applicant)
      .field('description', 'Descripción del reclamo para el equipo')
      .attach('evidence', pngBytes(256), { filename: 'prueba.png' })
      .expect(201);
    await as(http().post(`/join-requests/${id}/messages`), applicant).attach(
      'image',
      pngBytes(256),
      { filename: 'chat.png' },
    );
    for (const url of [`/join-requests/${id}`, `/join-requests/${id}/disputes`]) {
      for (const viewer of [applicant, group.ownerId]) {
        const body = JSON.stringify((await as(http().get(url), viewer).expect(200)).body);
        expect(body).not.toMatch(/join-requests\/[0-9a-f-]{36}\/|proofs\/|_key|Key"/);
      }
    }
  });

  it('RNF-010-02: los logs no llevan el texto de mensajes, referencias ni nombres de archivo', async () => {
    const lines: string[] = [];
    for (const level of ['log', 'warn', 'error', 'debug', 'verbose'] as const) {
      jest.spyOn(Logger.prototype, level).mockImplementation((...args: unknown[]) => {
        lines.push(args.map(String).join(' '));
      });
    }
    const id = await seedRequest(harness, group, applicant, 'esperando_pago');
    harness.storage.failPut = true;
    await as(http().post(`/join-requests/${id}/messages`), applicant)
      .field('text', 'Texto confidencial del chat')
      .attach('image', pngBytes(), { filename: 'archivo-confidencial.png' });
    harness.storage.failPut = false;
    await as(http().post(`/join-requests/${id}/messages`), applicant)
      .field('text', 'Texto confidencial del chat')
      .expect(201);
    await as(http().post(`/join-requests/${id}/messages`), applicant)
      .attach('image', pdfBytes(), { filename: 'archivo-confidencial.pdf' })
      .expect(415);
    expect(lines.join('\n')).not.toMatch(/confidencial/);
  });
});
