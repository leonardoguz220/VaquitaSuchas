import request from 'supertest';
import { TxEventBus } from '../src/shared/events/tx-event-bus.js';
import type {
  JoinRequestAccepted,
  JoinRequestExpired,
} from '../src/shared/events/join-request-events.js';
import { JobRunner } from '../src/shared/jobs/job-runner.js';
import { REPUTATION_QUERY_PORT } from '../src/modules/join-requests/ports/reputation-query.port.js';
import { ListingsModule } from '../src/modules/listings/listings.module.js';
import { ListingsService } from '../src/modules/listings/services/listings.service.js';
import { BillingHarness, NOW, type TestGroup } from './support/billing-harness.js';
import { seedCatalogPlan } from './support/listings-fixtures.js';
import { seedRequest, setClock } from './support/join-requests-fixtures.js';

const PROOF_KEY = 'proofs/test.png';
const STARS = 4.5;

// Solicitar un cupo de una publicación y el ingreso por ella (spec 008 US3, T017/T018), sobre
// el flujo de la spec 010, contra PostgreSQL real.
describe('Solicitudes de ingreso desde publicaciones (spec 008)', () => {
  const reputation = new Map<string, { stars: number | null; level: string | null }>();
  const harness = new BillingHarness({
    imports: [ListingsModule],
    configure: (builder) =>
      builder.overrideProvider(REPUTATION_QUERY_PORT).useValue({
        getMany: (_q: unknown, ids: readonly string[]) =>
          Promise.resolve(
            new Map(ids.map((id) => [id, reputation.get(id) ?? { stars: null, level: null }])),
          ),
      }),
  });
  const call = (method: 'get' | 'post', userId: string, url: string): request.Test =>
    request(harness.app.getHttpServer())
      [method](url)
      .set('Authorization', `Bearer ${harness.token(userId)}`);
  const requestSeat = (userId: string, listingId: string, body: object = {}): request.Test =>
    call('post', userId, `/listings/${listingId}/requests`).send(body);

  /** Grupo con `members` miembros y una publicación de `offered` cupos hecha por el titular. */
  async function publishedGroup(
    members: number,
    offered: number,
  ): Promise<{ group: TestGroup; listingId: string }> {
    const group = await harness.createGroup({ members });
    const response = await call('post', group.ownerId, `/groups/${group.id}/listing`)
      .send({ slotsOffered: offered })
      .expect(201);
    return { group, listingId: response.body.id };
  }
  const listingState = async (listingId: string) =>
    (
      await harness.pool.query<{
        status: string;
        slots_offered: number;
        end_reason: string | null;
      }>('SELECT status, slots_offered, end_reason FROM listings WHERE id = $1', [listingId])
    ).rows[0];
  const statusOf = async (id: string): Promise<string> =>
    (
      await harness.pool.query<{ status: string }>(
        'SELECT status FROM join_requests WHERE id = $1',
        [id],
      )
    ).rows[0]?.status as string;
  /** El solicitante informó el pago: la solicitud queda lista para que el titular confirme. */
  async function informPayment(requestId: string): Promise<void> {
    await harness.pool.query(
      `UPDATE join_requests
          SET status = 'pago_informado', proof_key = $2, proof_mime = 'image/png',
              proof_size_bytes = 4, proof_method = 'qr', proof_reference = 'REF-1',
              proof_uploaded_at = $3, decision_deadline_at = $4, version = version + 1
        WHERE id = $1`,
      [requestId, PROOF_KEY, NOW, new Date(Date.parse(NOW) + 24 * 3600_000).toISOString()],
    );
  }
  /** Lleva una solicitud abierta al pago informado por los pasos reales del titular. */
  async function pay(group: TestGroup, requestId: string): Promise<void> {
    await call('post', group.ownerId, `/join-requests/${requestId}/payment-data`).expect(200);
    await informPayment(requestId);
  }
  const confirm = (group: TestGroup, requestId: string): request.Test =>
    call('post', group.ownerId, `/join-requests/${requestId}/confirm`);

  beforeAll(() => harness.start(), 60_000);
  afterAll(() => harness.stop(), 30_000);
  afterEach(() => {
    setClock(harness, NOW);
  });
  beforeEach(() => {
    harness.storage.files.set(PROOF_KEY, {
      body: new Uint8Array([0x89, 0x50]),
      contentType: 'image/png',
    });
  });

  it('CA-008-08: un mensaje de 250 caracteres se rechaza; uno de 200 abre la solicitud con la primera línea del chat', async () => {
    const { group, listingId } = await publishedGroup(1, 2);
    const applicant = await harness.insertUser();

    const tooLong = await requestSeat(applicant, listingId, { message: 'a'.repeat(250) }).expect(
      400,
    );
    expect(tooLong.body.code).toBe('VALIDATION_ERROR');
    expect(tooLong.body.details.fields).toHaveProperty('message');

    const ok = await requestSeat(applicant, listingId, { message: 'b'.repeat(200) }).expect(201);
    expect(ok.body).toMatchObject({ source: 'publicacion', phase: { status: 'abierta' } });
    expect(ok.body.group.id).toBe(group.id);
    const lines = await harness.pool.query<{ body: string }>(
      'SELECT body FROM join_messages WHERE request_id = $1',
      [ok.body.id],
    );
    expect(lines.rows.map((r) => r.body)).toEqual(['b'.repeat(200)]);
  });

  it('RF-008-10: una publicación inexistente, propia o de un grupo donde ya es miembro responde 404 LISTING_NOT_FOUND', async () => {
    const { group, listingId } = await publishedGroup(1, 1);
    for (const userId of [group.ownerId, group.memberIds[0] as string]) {
      const response = await requestSeat(userId, listingId).expect(404);
      expect(response.body.code).toBe('LISTING_NOT_FOUND');
    }
    await requestSeat(await harness.insertUser(), '00000000-0000-4000-8000-000000000000').expect(
      404,
    );
  });

  it('CA-008-09: con 5 solicitudes activas, la sexta se rechaza', async () => {
    const { listingId } = await publishedGroup(1, 1);
    const applicant = await harness.insertUser();
    for (let i = 0; i < 5; i++) {
      await seedRequest(harness, await harness.createGroup({ members: 1 }), applicant, 'abierta');
    }

    const response = await requestSeat(applicant, listingId).expect(422);

    expect(response.body.code).toBe('TOO_MANY_ACTIVE_REQUESTS');
  });

  it('RN-008-06: la ventana cerrada, la solicitud activa en el grupo y el nivel "En riesgo" siguen las reglas de la spec 010', async () => {
    const { group, listingId } = await publishedGroup(1, 2);
    const risky = await harness.insertUser();
    reputation.set(risky, { stars: 1, level: 'En riesgo' });
    await requestSeat(risky, listingId).expect(201); // "En riesgo" no impide solicitar
    const again = await requestSeat(risky, listingId).expect(422);
    expect(again.body.code).toBe('ACTIVE_REQUEST_EXISTS');

    await harness.pool.query('UPDATE groups SET billing_day = 5 WHERE id = $1', [group.id]);
    const late = await requestSeat(await harness.insertUser(), listingId).expect(422);
    expect(late.body.code).toBe('ENTRY_WINDOW_CLOSED');
    expect(late.body.details.opensAt).toEqual(expect.any(String));
  });

  it('CA-008-22: una cuenta suspendida no solicita: sin sesión por HTTP y ACCOUNT_RESTRICTED en el servicio', async () => {
    const { listingId } = await publishedGroup(1, 1);
    const applicant = await harness.insertUser();
    await harness.pool.query(`UPDATE users SET status = 'suspendido' WHERE id = $1`, [applicant]);

    await requestSeat(applicant, listingId).expect(401);
    await expect(
      harness.app.get(ListingsService).requestSeat(applicant, listingId, null),
    ).rejects.toMatchObject({ code: 'ACCOUNT_RESTRICTED', httpStatus: 403 });
  });

  it('CA-008-10: al confirmar, la persona ingresa, se cobra su ingreso, baja el cupo ofrecido y se avisa del ingreso', async () => {
    const { group, listingId } = await publishedGroup(1, 2);
    const applicant = await harness.insertUser();
    const accepted: JoinRequestAccepted[] = [];
    harness.app
      .get(TxEventBus, { strict: false })
      .register<JoinRequestAccepted>('join-requests.accepted', (_tx, event) => {
        if (event.groupId === group.id) accepted.push(event);
      });
    const opened = await requestSeat(applicant, listingId, { message: 'Hola' }).expect(201);
    await pay(group, opened.body.id);

    await confirm(group, opened.body.id).expect(200);

    expect(await statusOf(opened.body.id)).toBe('aceptada');
    const member = await harness.pool.query(
      `SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2 AND left_at IS NULL`,
      [group.id, applicant],
    );
    expect(member.rowCount).toBe(1);
    const charge = await harness.pool.query(
      `SELECT 1 FROM charges WHERE group_id = $1 AND user_id = $2`,
      [group.id, applicant],
    );
    expect(charge.rowCount).toBe(1);
    expect(accepted).toHaveLength(1);
    expect(accepted[0]).toMatchObject({ applicantId: applicant, listingId });
    expect(await listingState(listingId)).toMatchObject({ status: 'activa', slots_offered: 1 });
  });

  it('CA-008-11: con 1 cupo y 3 solicitudes abiertas, al confirmar una las otras pasan a rechazada y la publicación se cierra', async () => {
    const { group, listingId } = await publishedGroup(1, 1);
    const [a, b, c] = [
      await harness.insertUser(),
      await harness.insertUser(),
      await harness.insertUser(),
    ];
    const ids: string[] = [];
    for (const user of [a, b, c]) {
      ids.push((await requestSeat(user, listingId).expect(201)).body.id);
    }
    await pay(group, ids[0] as string);

    await confirm(group, ids[0] as string).expect(200);

    expect(await statusOf(ids[0] as string)).toBe('aceptada');
    expect(await statusOf(ids[1] as string)).toBe('rechazada');
    expect(await statusOf(ids[2] as string)).toBe('rechazada');
    const reasons = await harness.pool.query<{ final_reason: string }>(
      'SELECT final_reason FROM join_requests WHERE id = ANY($1::uuid[]) AND status = $2',
      [ids, 'rechazada'],
    );
    expect(reasons.rows.map((r) => r.final_reason)).toEqual(['sin_cupo', 'sin_cupo']);
    expect(await listingState(listingId)).toEqual({
      status: 'cerrada',
      slots_offered: 0,
      end_reason: 'cupos_completos',
    });
    // La publicación cerrada sale de la búsqueda y ya no admite solicitudes.
    await requestSeat(await harness.insertUser(), listingId).expect(404);
  });

  it('CA-008-13: el solicitante cancela antes de informar el pago y el titular ya no la ve entre las activas', async () => {
    const { group, listingId } = await publishedGroup(1, 1);
    const applicant = await harness.insertUser();
    const opened = await requestSeat(applicant, listingId).expect(201);
    const before = await call('get', group.ownerId, `/groups/${group.id}/join-requests`).expect(
      200,
    );
    expect(before.body.items.map((i: { id: string }) => i.id)).toContain(opened.body.id);

    await call('post', applicant, `/join-requests/${opened.body.id}/cancel`).expect(200);

    const after = await call('get', group.ownerId, `/groups/${group.id}/join-requests`).expect(200);
    const visible = after.body.items.filter(
      (i: { id: string; phase: { status: string } }) =>
        i.id === opened.body.id && i.phase.status === 'abierta',
    );
    expect(visible).toEqual([]);
    expect(await statusOf(opened.body.id)).toBe('cancelada');
  });

  it('CA-008-15: sin datos de pago en 24 h la solicitud expira y se publica el aviso', async () => {
    const { listingId } = await publishedGroup(1, 1);
    const applicant = await harness.insertUser();
    const opened = await requestSeat(applicant, listingId).expect(201);
    const expired: JoinRequestExpired[] = [];
    harness.app
      .get(TxEventBus, { strict: false })
      .register<JoinRequestExpired>('join-requests.expired', (_tx, event) => {
        if (event.requestId === opened.body.id) expired.push(event);
      });

    harness.clock.advance(25 * 3600_000);
    const [result] = await harness.app
      .get(JobRunner, { strict: false })
      .runAll('manual', { job: 'join_requests.sweep' });

    expect(result).toMatchObject({ status: 'ok' });
    expect(await statusOf(opened.body.id)).toBe('expirada');
    expect(expired).toHaveLength(1);
    expect(expired[0]).toMatchObject({ applicantId: applicant, reason: 'plazo_solicitud' });
  });

  it('CA-008-20: quien no es el titular no acepta: un miembro recibe 403 y una persona ajena 404', async () => {
    const { group, listingId } = await publishedGroup(2, 1);
    const opened = await requestSeat(await harness.insertUser(), listingId).expect(201);
    await pay(group, opened.body.id);

    await call(
      'post',
      group.memberIds[0] as string,
      `/join-requests/${opened.body.id}/confirm`,
    ).expect(403);
    await call(
      'post',
      await harness.insertUser(),
      `/join-requests/${opened.body.id}/confirm`,
    ).expect(404);

    expect(await statusOf(opened.body.id)).toBe('pago_informado');
  });

  it('CA-008-21: el titular ve el nivel y las estrellas del solicitante en la lista de la spec 010', async () => {
    const { group, listingId } = await publishedGroup(1, 1);
    const applicant = await harness.insertUser();
    reputation.set(applicant, { stars: STARS, level: 'Bueno' });
    await requestSeat(applicant, listingId, { message: 'Hola' }).expect(201);

    const list = await call('get', group.ownerId, `/groups/${group.id}/join-requests`).expect(200);

    const item = list.body.items.find(
      (i: { applicant: { userId: string } }) => i.applicant.userId === applicant,
    );
    expect(item.applicant).toMatchObject({ stars: STARS, level: 'Bueno' });
    expect(item.source).toBe('publicacion');
  });

  it('CA-008-24 y RN-008-05: al ser aceptado, sus otras solicitudes abierta al mismo servicio pasan a cancelada y las que están en pago siguen', async () => {
    const { planId } = await seedCatalogPlan(harness, 'Netflix');
    const target = await publishedGroup(1, 1);
    const sameA = await publishedGroup(1, 1);
    const sameB = await publishedGroup(1, 1);
    // La copia del catálogo es inmutable para el servicio; la prueba la fija con el disparador apagado.
    await harness.pool.query('ALTER TABLE groups DISABLE TRIGGER groups_immutable_snapshots');
    try {
      for (const g of [target.group, sameA.group, sameB.group]) {
        await harness.pool.query(
          `UPDATE groups SET catalog_plan_id = $2, plan_name_snapshot = 'Premium' WHERE id = $1`,
          [g.id, planId],
        );
      }
    } finally {
      await harness.pool.query('ALTER TABLE groups ENABLE TRIGGER groups_immutable_snapshots');
    }
    const other = await publishedGroup(1, 1); // servicio distinto
    const applicant = await harness.insertUser();
    const mine = (await requestSeat(applicant, target.listingId).expect(201)).body.id as string;
    const open = (await requestSeat(applicant, sameA.listingId).expect(201)).body.id as string;
    const paying = (await requestSeat(applicant, sameB.listingId).expect(201)).body.id as string;
    const unrelated = (await requestSeat(applicant, other.listingId).expect(201)).body.id as string;
    await call('post', sameB.group.ownerId, `/join-requests/${paying}/payment-data`).expect(200);
    await pay(target.group, mine);

    await confirm(target.group, mine).expect(200);

    expect(await statusOf(open)).toBe('cancelada');
    expect(await statusOf(paying)).toBe('esperando_pago');
    expect(await statusOf(unrelated)).toBe('abierta');
  });
});
