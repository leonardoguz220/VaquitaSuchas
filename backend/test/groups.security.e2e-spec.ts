import request from 'supertest';
import { BillingHarness, type TestGroup } from './support/billing-harness.js';
import { pngBytes } from './support/receipt-files.js';

// Revisión de seguridad de grupos (spec 001 T039): acciones por rol, código solo para el titular,
// textos libres como texto plano, QR con nombre generado y montos en centavos enteros.
describe('Seguridad de grupos', () => {
  const harness = new BillingHarness();
  const http = (): ReturnType<typeof request> => request(harness.app.getHttpServer());
  const as = (userId: string, test: request.Test): request.Test =>
    test.set('Authorization', `Bearer ${harness.token(userId)}`);

  type Call = (group: TestGroup, userId: string) => request.Test;
  const allowed = (status: number): boolean => ![401, 403, 404].includes(status);

  // Tabla de acciones: cada fila dice qué recibe el titular, el miembro y quien no pertenece.
  const actions: { name: string; owner: 'ok' | number; call: Call }[] = [
    {
      name: 'GET /groups/:id',
      owner: 200,
      call: (g, u) => as(u, http().get(`/groups/${g.id}`)),
    },
    {
      name: 'PATCH /groups/:id',
      owner: 200,
      call: (g, u) => as(u, http().patch(`/groups/${g.id}`)).send({ name: 'Nuevo nombre' }),
    },
    {
      name: 'PUT /groups/:id/payment-info',
      owner: 200,
      call: (g, u) => as(u, http().put(`/groups/${g.id}/payment-info`)).field('text', 'Banco'),
    },
    {
      name: 'POST /groups/:id/invite-code/regenerate',
      owner: 200,
      call: (g, u) => as(u, http().post(`/groups/${g.id}/invite-code/regenerate`)),
    },
    {
      name: 'DELETE /groups/:id/members/:userId',
      owner: 200,
      call: (g, u) => as(u, http().delete(`/groups/${g.id}/members/${g.memberIds[1]}`)),
    },
    {
      name: 'POST /groups/:id/transfer-ownership',
      owner: 'ok',
      call: (g, u) =>
        as(u, http().post(`/groups/${g.id}/transfer-ownership`)).send({ toUserId: g.memberIds[0] }),
    },
    {
      name: 'POST /groups/:id/close',
      owner: 200,
      call: (g, u) => as(u, http().post(`/groups/${g.id}/close`)),
    },
  ];

  beforeAll(() => harness.start(), 60_000);
  afterAll(() => harness.stop(), 30_000);

  it.each(actions)(
    'RNF-001-01: $name — titular permitido, miembro 403, ajeno 404',
    async (action) => {
      const group = await harness.createGroup({ members: 2 });
      const outsider = await harness.insertUser();
      const member = group.memberIds[0] as string;

      const asOutsider = await action.call(group, outsider);
      const asMember = await action.call(group, member);
      const asOwner = await action.call(group, group.ownerId);

      expect(asOutsider.status).toBe(404);
      expect(asMember.status).toBe(action.name.startsWith('GET') ? 200 : 403);
      if (action.owner === 'ok') expect(allowed(asOwner.status)).toBe(true);
      else expect(asOwner.status).toBe(action.owner);
    },
  );

  it('RNF-001-01: abandonar es solo para miembros activos y un ajeno recibe 404', async () => {
    const group = await harness.createGroup({ members: 1 });
    const outsider = await harness.insertUser();

    await as(outsider, http().post(`/groups/${group.id}/leave`)).expect(404);
    await as(group.memberIds[0] as string, http().post(`/groups/${group.id}/leave`)).expect(204);
  });

  it('RNF-001-01: sin sesión toda acción de grupo responde 401', async () => {
    const group = await harness.createGroup({ members: 1 });

    const calls: (() => request.Test)[] = [
      () => http().get('/groups'),
      () => http().get(`/groups/${group.id}`),
      () => http().patch(`/groups/${group.id}`),
      () => http().put(`/groups/${group.id}/payment-info`),
      () => http().post(`/groups/${group.id}/invite-code/regenerate`),
      () => http().post(`/groups/${group.id}/leave`),
    ];
    for (const call of calls) {
      await call().expect(401);
    }
  });

  it('RNF-001-02: el código de invitación solo aparece en las respuestas del titular', async () => {
    const group = await harness.createGroup({ members: 1 });
    const code = (
      await harness.pool.query<{ invite_code: string }>(
        'SELECT invite_code FROM groups WHERE id = $1',
        [group.id],
      )
    ).rows[0]?.invite_code as string;
    const member = group.memberIds[0] as string;

    const memberDetail = await as(member, http().get(`/groups/${group.id}`)).expect(200);
    const memberList = await as(member, http().get('/groups')).expect(200);
    const ownerList = await as(group.ownerId, http().get('/groups')).expect(200);
    const ownerDetail = await as(group.ownerId, http().get(`/groups/${group.id}`)).expect(200);

    expect(JSON.stringify(memberDetail.body)).not.toContain(code);
    expect(JSON.stringify(memberList.body)).not.toContain(code);
    expect(JSON.stringify(ownerList.body)).not.toContain(code);
    expect(ownerDetail.body.inviteCode).toBe(code);
  });

  it('RNF-001-01: los textos libres se devuelven como texto plano dentro de JSON', async () => {
    const group = await harness.createGroup({ members: 1 });
    const name = '<img src=x onerror=alert(1)>';
    const text = '<script>alert("x")</script> Banco & cuenta';

    await as(group.ownerId, http().patch(`/groups/${group.id}`))
      .send({ name })
      .expect(200);
    await as(group.ownerId, http().put(`/groups/${group.id}/payment-info`))
      .field('text', text)
      .expect(200);
    const detail = await as(group.memberIds[0] as string, http().get(`/groups/${group.id}`)).expect(
      200,
    );

    expect(detail.headers['content-type']).toMatch(/application\/json/);
    expect(detail.body.name).toBe(name);
    expect(detail.body.paymentInfo.text).toBe(text);
  });

  it('RNF-001-01: el QR se guarda con un nombre generado y no tiene ruta pública', async () => {
    const group = await harness.createGroup({ members: 1 });

    const response = await as(group.ownerId, http().put(`/groups/${group.id}/payment-info`))
      .attach('qr', pngBytes(), { filename: '../../etc/passwd.png' })
      .expect(200);

    const key = (
      await harness.pool.query<{ key: string }>(
        'SELECT payment_qr_key AS key FROM groups WHERE id = $1',
        [group.id],
      )
    ).rows[0]?.key as string;
    expect(key).toMatch(new RegExp(`^groups/${group.id}/qr/[0-9a-f-]{36}\\.png$`));
    expect(key).not.toContain('passwd');
    expect(response.body.paymentInfo.qrUrl).toContain('ttl=600');
    for (const url of [
      `/groups/${group.id}/payment-info`,
      `/groups/${group.id}/qr`,
      `/${key}`,
      `/files/${key}`,
    ]) {
      await as(group.ownerId, http().get(url)).expect(404);
    }
  });

  it('RNF-001-03: todos los montos de grupos son enteros en centavos', async () => {
    const group = await harness.createGroup({ members: 2 });

    const detail = await as(group.ownerId, http().get(`/groups/${group.id}`)).expect(200);
    const list = await as(group.ownerId, http().get('/groups')).expect(200);

    for (const value of [
      detail.body.priceCents,
      detail.body.myShareCents,
      detail.body.breakdown.totalBsCents,
      detail.body.breakdown.baseShareCents,
      detail.body.breakdown.ownerShareCents,
      detail.body.breakdown.remainderCents,
      list.body.items[0].myShareCents,
    ]) {
      expect(Number.isInteger(value)).toBe(true);
    }
  });
});
