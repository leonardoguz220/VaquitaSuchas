import { jest } from '@jest/globals';
import { Logger } from '@nestjs/common';
import request from 'supertest';
import type { ChatMessageSent } from '../src/shared/events/join-request-events.js';
import { TxEventBus } from '../src/shared/events/tx-event-bus.js';
import { JoinRequestsModule } from '../src/modules/join-requests/join-requests.module.js';
import { BillingHarness, NOW, type TestGroup } from './support/billing-harness.js';
import { seedRequest, setClock, type SeedState } from './support/join-requests-fixtures.js';
import { insertOwnedGroup } from './support/groups-fixtures.js';
import { exeBytes, jpegBytes, pdfBytes, pngBytes } from './support/receipt-files.js';

interface Message {
  id: string;
  seq: number;
  senderId: string;
  body: string | null;
  imageAvailable: boolean;
  createdAt: string;
}

// Chat de la solicitud (spec 010 US5, T032/T033) contra PostgreSQL real y almacén en memoria.
describe('Chat de solicitudes de ingreso', () => {
  const harness = new BillingHarness({ imports: [JoinRequestsModule] });
  let group: TestGroup;
  let applicant: string;
  let requestId: string;

  const auth = (test: request.Test, userId: string): request.Test =>
    test.set('Authorization', `Bearer ${harness.token(userId)}`);
  const http = (): ReturnType<typeof request> => request(harness.app.getHttpServer());
  const get = (userId: string, url: string): request.Test => auth(http().get(url), userId);
  const messagesUrl = (id = requestId): string => `/join-requests/${id}/messages`;
  const send = (
    userId: string,
    fields: { text?: string; image?: { bytes: Buffer; filename: string } } = {},
    id = requestId,
  ): request.Test => {
    let call = auth(http().post(messagesUrl(id)), userId);
    if (fields.text !== undefined) call = call.field('text', fields.text);
    if (fields.image)
      call = call.attach('image', fields.image.bytes, { filename: fields.image.filename });
    return call;
  };
  const list = (userId: string, query = '', id = requestId): request.Test =>
    get(userId, `${messagesUrl(id)}${query}`);
  const messageCount = async (id = requestId): Promise<number> =>
    Number(
      (
        await harness.pool.query<{ n: string }>(
          'SELECT count(*)::text AS n FROM join_messages WHERE request_id = $1',
          [id],
        )
      ).rows[0]?.n,
    );
  const status = async (id = requestId): Promise<string> =>
    (
      await harness.pool.query<{ status: string }>(
        'SELECT status FROM join_requests WHERE id = $1',
        [id],
      )
    ).rows[0]?.status as string;

  beforeAll(() => harness.start(), 60_000);
  afterAll(() => harness.stop(), 30_000);
  beforeEach(async () => {
    group = await harness.createGroup({ members: 1 });
    applicant = await harness.insertUser();
    requestId = await seedRequest(harness, group, applicant, 'esperando_pago');
    harness.storage.files.clear();
    harness.storage.failPut = false;
    harness.storage.failSignedUrl = false;
  });
  afterEach(() => {
    setClock(harness, NOW);
    jest.restoreAllMocks();
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  it('CA-010-19: un texto y una imagen JPG de 3 MB se ven en orden, y con afterSeq solo lo nuevo', async () => {
    const events: ChatMessageSent[] = [];
    harness.app
      .get(TxEventBus, { strict: false })
      .register<ChatMessageSent>('join-requests.chat-message-sent', (_tx, event) => {
        if (event.requestId === requestId) events.push(event);
      });

    const first = await send(applicant, { text: 'Hola, ya pagué' }).expect(201);
    const second = await send(group.ownerId, {
      image: { bytes: jpegBytes(3 * 1024 * 1024), filename: 'foto-privada.jpg' },
    }).expect(201);

    expect(first.body).toMatchObject({
      body: 'Hola, ya pagué',
      senderId: applicant,
      imageAvailable: false,
    });
    expect(second.body).toMatchObject({
      body: null,
      senderId: group.ownerId,
      imageAvailable: true,
    });
    expect(second.body.seq).toBeGreaterThan(first.body.seq);

    for (const viewer of [applicant, group.ownerId]) {
      const all = await list(viewer).expect(200);
      expect(all.body.serverNow).toBe(NOW);
      expect(all.body.items.map((m: Message) => m.id)).toEqual([first.body.id, second.body.id]);
    }
    const after = await list(applicant, `?afterSeq=${first.body.seq}`).expect(200);
    expect(after.body.items.map((m: Message) => m.id)).toEqual([second.body.id]);
    const limited = await list(applicant, '?limit=1').expect(200);
    expect(limited.body.items).toHaveLength(1);
    await list(applicant, '?limit=101').expect(400);

    const stored = await harness.pool.query<{ image_key: string; image_mime: string }>(
      'SELECT image_key, image_mime FROM join_messages WHERE id = $1',
      [second.body.id],
    );
    const key = stored.rows[0]?.image_key as string;
    expect(key).toMatch(
      new RegExp(`^join-requests/${group.id}/${requestId}/chat-[0-9a-f-]{36}\\.jpg$`),
    );
    expect(key).not.toContain('foto-privada');
    const image = await get(applicant, `${messagesUrl()}/${second.body.id}/image`).expect(200);
    expect(image.body.mime).toBe('image/jpeg');
    expect(image.body.url).toContain(key);
    expect(Date.parse(image.body.expiresAt) - Date.parse(NOW)).toBeLessThanOrEqual(600_000);
    await get(applicant, `${messagesUrl()}/${first.body.id}/image`).expect(404);
    expect(events).toEqual([
      expect.objectContaining({
        senderId: applicant,
        recipientId: group.ownerId,
        messageId: first.body.id,
      }),
      expect.objectContaining({
        senderId: group.ownerId,
        recipientId: applicant,
        messageId: second.body.id,
      }),
    ]);
    expect(JSON.stringify(events)).not.toContain('Hola');
  });

  it('RF-010-05: texto e imagen en el mismo mensaje; una imagen PNG se guarda como PNG', async () => {
    const response = await send(applicant, {
      text: 'Mi comprobante',
      image: { bytes: pngBytes(), filename: 'x.png' },
    }).expect(201);
    expect(response.body).toMatchObject({ body: 'Mi comprobante', imageAvailable: true });
    const mime = await harness.pool.query('SELECT image_mime FROM join_messages WHERE id = $1', [
      response.body.id,
    ]);
    expect(mime.rows[0]).toEqual({ image_mime: 'image/png' });
  });

  describe('CA-010-21: validación', () => {
    it('un texto de 1.001 caracteres se rechaza y uno de 1.000 se acepta', async () => {
      const long = await send(applicant, { text: 'a'.repeat(1001) }).expect(400);
      expect(long.body.code).toBe('VALIDATION_ERROR');
      expect(await messageCount()).toBe(0);
      await send(applicant, { text: 'a'.repeat(1000) }).expect(201);
    });

    it('un PDF o un ejecutable adjunto se rechaza (415) aunque se llame .jpg', async () => {
      const pdf = await send(applicant, { image: { bytes: pdfBytes(), filename: 'a.pdf' } }).expect(
        415,
      );
      expect(pdf.body.code).toBe('UNSUPPORTED_FILE_TYPE');
      await send(applicant, { image: { bytes: exeBytes(), filename: 'virus.jpg' } }).expect(415);
      expect(await messageCount()).toBe(0);
      expect(harness.storage.files.size).toBe(0);
    });

    it('una imagen de más de 5 MB se rechaza (413)', async () => {
      const big = await send(applicant, {
        image: { bytes: jpegBytes(5 * 1024 * 1024 + 1), filename: 'grande.jpg' },
      }).expect(413);
      expect(big.body.code).toBe('FILE_TOO_LARGE');
      expect(await messageCount()).toBe(0);
    });

    it('un mensaje vacío o solo con espacios se rechaza (400)', async () => {
      await send(applicant).expect(400);
      await send(applicant, { text: '   ' }).expect(400);
      expect(await messageCount()).toBe(0);
    });

    it('si el almacén falla al guardar la imagen responde 503 y no queda mensaje', async () => {
      harness.storage.failPut = true;
      const response = await send(applicant, {
        text: 'con foto',
        image: { bytes: pngBytes(), filename: 'x.png' },
      }).expect(503);
      expect(response.body.code).toBe('SERVICE_UNAVAILABLE');
      expect(await messageCount()).toBe(0);
    });
  });

  it('CA-010-22: un mensaje con <script> se guarda y se devuelve tal cual, como texto plano', async () => {
    const payload = '<script>alert("x")</script>';
    const sent = await send(applicant, { text: payload }).expect(201);
    expect(sent.body.body).toBe(payload);

    const response = await list(group.ownerId).expect(200);

    expect(response.headers['content-type']).toContain('application/json');
    expect(response.body.items[0].body).toBe(payload);
    const stored = await harness.pool.query('SELECT body FROM join_messages WHERE id = $1', [
      sent.body.id,
    ]);
    expect(stored.rows[0]).toEqual({ body: payload });
  });

  it('CA-010-23: no existe editar ni borrar mensajes (PUT, PATCH y DELETE dan 404) y la base tampoco lo permite', async () => {
    const sent = await send(applicant, { text: 'definitivo' }).expect(201);
    for (const url of [`${messagesUrl()}/${sent.body.id}`, messagesUrl()]) {
      await auth(http().put(url), applicant).send({ text: 'editado' }).expect(404);
      await auth(http().patch(url), applicant).send({ text: 'editado' }).expect(404);
      await auth(http().delete(url), applicant).expect(404);
    }
    expect((await list(applicant).expect(200)).body.items[0].body).toBe('definitivo');
    await expect(
      harness.pool.query('UPDATE join_messages SET body = $2 WHERE id = $1', [sent.body.id, 'x']),
    ).rejects.toThrow();
    await expect(
      harness.pool.query('DELETE FROM join_messages WHERE id = $1', [sent.body.id]),
    ).rejects.toThrow();
  });

  describe('CA-010-24: estados finales en solo lectura', () => {
    const toFinal: Record<string, (id: string) => Promise<void>> = {
      aceptada: async (id) => {
        await auth(http().post(`/join-requests/${id}/cash-payment`), group.ownerId)
          .send({})
          .expect(200);
      },
      rechazada: async (id) => {
        await auth(http().post(`/join-requests/${id}/reject`), group.ownerId)
          .send({ reason: 'Sin cupo' })
          .expect(200);
      },
      cancelada: async (id) => {
        await auth(http().post(`/join-requests/${id}/cancel`), applicant)
          .send({})
          .expect(200);
      },
    };

    it.each(Object.keys(toFinal))(
      'en %s no se puede enviar (CHAT_READ_ONLY) pero sí leer',
      async (final) => {
        await send(applicant, { text: 'antes' }).expect(201);
        await (toFinal[final] as (id: string) => Promise<void>)(requestId);

        const blocked = await send(group.ownerId, { text: 'después' }).expect(422);

        expect(blocked.body).toMatchObject({
          code: 'CHAT_READ_ONLY',
          details: { rule: 'RF-010-07' },
        });
        expect(await messageCount()).toBe(1);
        const read = await list(applicant).expect(200);
        expect(read.body.items.map((m: Message) => m.body)).toEqual(['antes']);
        const detail = await get(applicant, `/join-requests/${requestId}`).expect(200);
        expect(detail.body.allowedActions).not.toContain('sendMessage');
      },
    );

    it('expirada: un plazo vencido aunque nadie lo haya persistido también deja el chat en lectura', async () => {
      const id = await seedRequest(harness, group, await harness.insertUser(), 'abierta', {
        openMinutes: 10,
      });
      setClock(harness, new Date(Date.parse(NOW) + 11 * 60_000).toISOString());

      const blocked = await send(group.ownerId, { text: 'tarde' }, id).expect(422);

      expect(blocked.body.code).toBe('CHAT_READ_ONLY');
      expect(await status(id)).toBe('expirada');
      expect(await messageCount(id)).toBe(0);
    });

    it('se puede escribir mientras la solicitud está abierta, esperando pago o con pago informado', async () => {
      for (const state of ['abierta', 'pago_informado'] as SeedState[]) {
        const id = await seedRequest(harness, group, await harness.insertUser(), state);
        await send(group.ownerId, { text: state }, id).expect(201);
      }
    });
  });

  describe('RF-010-10: límite de 20 mensajes por minuto', () => {
    it('el mensaje 21 recibe RATE_LIMITED con retryAfterSeconds y el límite es por persona y solicitud', async () => {
      for (let i = 0; i < 20; i++) await send(applicant, { text: `m${i}` }).expect(201);

      const limited = await send(applicant, { text: 'm20' }).expect(429);

      expect(limited.body.code).toBe('RATE_LIMITED');
      expect(limited.body.details.retryAfterSeconds).toBe(60);
      expect(await messageCount()).toBe(20);
      // El titular tiene su propio contador, y otra solicitud también.
      await send(group.ownerId, { text: 'respuesta' }).expect(201);
      const otherGroup = await insertOwnedGroup(harness, await harness.insertUser());
      const other = await seedRequest(harness, { id: otherGroup }, applicant, 'abierta');
      await send(applicant, { text: 'otra solicitud' }, other).expect(201);

      setClock(harness, new Date(Date.parse(NOW) + 61_000).toISOString());
      await send(applicant, { text: 'ya pasó el minuto' }).expect(201);
    });

    it('los mensajes rechazados por validación o por estado no gastan el límite', async () => {
      for (let i = 0; i < 25; i++) await send(applicant, { text: 'a'.repeat(1001) }).expect(400);
      for (let i = 0; i < 20; i++) await send(applicant, { text: `m${i}` }).expect(201);
    });
  });

  describe('Contador de no leídos (RF-010-09)', () => {
    it('unreadCount y el resumen cuentan los mensajes ajenos y POST …/read los marca', async () => {
      const a = await send(group.ownerId, { text: 'uno' }).expect(201);
      const b = await send(group.ownerId, { text: 'dos' }).expect(201);
      await send(applicant, { text: 'propio' }).expect(201);

      const detail = await get(applicant, `/join-requests/${requestId}`).expect(200);
      expect(detail.body.unreadCount).toBe(2);
      expect(
        (await get(applicant, '/me/join-requests/summary').expect(200)).body.unreadMessages,
      ).toBe(2);
      expect(
        (await get(group.ownerId, `/join-requests/${requestId}`).expect(200)).body.unreadCount,
      ).toBe(1);

      await auth(http().post(`/join-requests/${requestId}/read`), applicant)
        .send({ upToSeq: a.body.seq })
        .expect(204);
      expect((await get(applicant, `/join-requests/${requestId}`)).body.unreadCount).toBe(1);
      // Marcar un seq anterior no retrocede y uno futuro no marca mensajes que aún no existen.
      await auth(http().post(`/join-requests/${requestId}/read`), applicant)
        .send({ upToSeq: 0 })
        .expect(204);
      expect((await get(applicant, `/join-requests/${requestId}`)).body.unreadCount).toBe(1);
      await auth(http().post(`/join-requests/${requestId}/read`), applicant)
        .send({ upToSeq: b.body.seq + 1000 })
        .expect(204);
      expect((await get(applicant, `/join-requests/${requestId}`)).body.unreadCount).toBe(0);
      const later = await send(group.ownerId, { text: 'tres' }).expect(201);
      expect(later.body.seq).toBeGreaterThan(b.body.seq);
      expect((await get(applicant, `/join-requests/${requestId}`)).body.unreadCount).toBe(1);
      await auth(http().post(`/join-requests/${requestId}/read`), applicant)
        .send({})
        .expect(400);
    });
  });

  describe('RNF-010-01 y RNF-010-02: acceso', () => {
    it('otro miembro del grupo recibe 403 y una persona ajena 404 en todo el chat', async () => {
      const sent = await send(applicant, {
        text: 'privado',
        image: { bytes: pngBytes(), filename: 'p.png' },
      }).expect(201);
      const member = group.memberIds[0] as string;
      const stranger = await harness.insertUser();
      const read = (u: string, url: string) => get(u, url);
      const post = (u: string, url: string) => auth(http().post(url), u).send({ upToSeq: 1 });

      for (const [user, code] of [
        [member, 403],
        [stranger, 404],
      ] as const) {
        await read(user, messagesUrl()).expect(code);
        await read(user, `${messagesUrl()}/${sent.body.id}/image`).expect(code);
        await send(user, { text: 'intruso' }).expect(code);
        await post(user, `/join-requests/${requestId}/read`).expect(code);
      }
      await http().get(messagesUrl()).expect(401);
      expect(await messageCount()).toBe(1);
    });

    it('una solicitud inexistente da 404 y la imagen de otra solicitud no se alcanza por este id', async () => {
      await list(applicant, '', '00000000-0000-4000-8000-000000000000').expect(404);
      const sent = await send(applicant, {
        image: { bytes: pngBytes(), filename: 'p.png' },
      }).expect(201);
      const other = await seedRequest(harness, group, await harness.insertUser(), 'abierta');
      await get(group.ownerId, `${messagesUrl(other)}/${sent.body.id}/image`).expect(404);
    });

    it('RNF-010-02: tras la retención la imagen responde 410 FILE_DELETED y el mensaje ya no la ofrece', async () => {
      const sent = await send(applicant, {
        image: { bytes: pngBytes(), filename: 'p.png' },
      }).expect(201);
      await harness.pool.query('UPDATE join_requests SET content_purged_at = now() WHERE id = $1', [
        requestId,
      ]);
      const response = await get(applicant, `${messagesUrl()}/${sent.body.id}/image`).expect(410);
      expect(response.body.code).toBe('FILE_DELETED');
      expect((await list(applicant).expect(200)).body.items[0].imageAvailable).toBe(false);
    });

    it('RNF-010-02: ningún registro del servidor contiene el texto de los mensajes', async () => {
      const spies = (['log', 'warn', 'error', 'debug', 'verbose'] as const).map((level) =>
        jest.spyOn(Logger.prototype, level).mockImplementation(() => undefined),
      );
      const secret = 'texto-secreto-del-chat-4711';
      harness.storage.failPut = true;
      await send(applicant, {
        text: secret,
        image: { bytes: pngBytes(), filename: 'p.png' },
      }).expect(503);
      harness.storage.failPut = false;
      await send(applicant, { text: secret }).expect(201);
      await send(applicant, { text: secret.repeat(100) }).expect(400);

      const logged = spies
        .flatMap((spy) => spy.mock.calls)
        .map((call) => JSON.stringify(call))
        .join('\n');
      expect(logged).not.toContain(secret);
    });
  });
});
