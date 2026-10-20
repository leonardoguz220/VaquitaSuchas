import { hostEnable, HostEnableError } from '../src/cli/host-enable.js';
import { startAuthApp, type AuthTestApp } from './support/auth-app.js';
import { asAdmin, createAdmin, randomPassword, type AdminActor } from './support/admin-fixtures.js';

const REASON = 'Titular conocido con buen historial fuera de la app';
const REVOKE = 'Se detectó un incumplimiento con el grupo';

// Spec 009, US3: habilitación manual de titulares (RF-009-21, RF-007-17). Requiere PostgreSQL.
describe('Titulares habilitados (spec 009)', () => {
  let t: AuthTestApp;
  let admin: AdminActor;

  const newUser = async () => {
    const password = randomPassword();
    const user = await t.createUser({ password });
    const token = (await t.login(user.email, password)).body.sessionToken as string;
    return { ...user, token };
  };
  const enable = (userId: string, body: object = { reason: REASON }, actor = admin) =>
    asAdmin(t, actor, 'post', `/admin/users/${userId}/host-enablement`).send(body);
  const revoke = (userId: string, body: object = { reason: REVOKE }) =>
    asAdmin(t, admin, 'post', `/admin/users/${userId}/host-enablement/revoke`).send(body);
  const eligibility = (token: string) =>
    t.http().get('/users/me/host-eligibility').set('Authorization', `Bearer ${token}`);
  const createGroup = (token: string) =>
    t.http().post('/groups').set('Authorization', `Bearer ${token}`).send({
      customServiceName: 'Mi servicio',
      name: 'Grupo de prueba',
      priceCents: 10001,
      currency: 'BS',
      billingDay: 15,
      totalSlots: 3,
    });
  const audit = async (targetId: string) =>
    (
      await t.db.query<{
        action: string;
        reason: string | null;
        metadata: Record<string, unknown>;
      }>(
        'SELECT action, reason, metadata FROM admin_audit_log WHERE target_id = $1 ORDER BY occurred_at, id',
        [targetId],
      )
    ).rows;

  beforeAll(async () => {
    t = await startAuthApp();
    admin = await createAdmin(t);
  }, 60_000);
  afterAll(async () => {
    await t?.close();
  }, 30_000);

  it('CA-009-28: la habilitación manual permite crear grupos, aparece en el listado y se audita', async () => {
    const user = await newUser();
    expect((await eligibility(user.token)).body).toMatchObject({ eligible: false });
    expect((await createGroup(user.token)).status).toBe(422);

    const res = await enable(user.id);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ userId: user.id, reason: REASON, enabledBy: admin.id });
    expect((await eligibility(user.token)).body).toMatchObject({
      eligible: true,
      source: 'manual',
    });
    expect((await createGroup(user.token)).status).toBe(201);
    const list = await asAdmin(t, admin, 'get', '/admin/host-enablements?active=true');
    expect(list.status).toBe(200);
    expect(list.body.items.map((i: { userId: string }) => i.userId)).toContain(user.id);
    const entries = await audit(user.id);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ action: 'titular_habilitar', reason: REASON });
    expect(entries[0]!.metadata).toEqual({ enablementId: res.body.id });
  });

  it('CA-009-28: revocar con motivo quita la habilitación, sale del listado y se audita', async () => {
    const user = await newUser();
    const enabled = await enable(user.id);

    const res = await revoke(user.id);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: enabled.body.id, userId: user.id, revokeReason: REVOKE });
    expect((await eligibility(user.token)).body).toMatchObject({ eligible: false, source: null });
    expect((await createGroup(user.token)).status).toBe(422);
    const active = await asAdmin(t, admin, 'get', '/admin/host-enablements?active=true');
    expect(active.body.items.map((i: { userId: string }) => i.userId)).not.toContain(user.id);
    const all = await asAdmin(t, admin, 'get', '/admin/host-enablements?active=false');
    expect(all.body.items.map((i: { userId: string }) => i.userId)).toContain(user.id);
    const entries = await audit(user.id);
    expect(entries.map((e) => e.action)).toEqual([
      'titular_habilitar',
      'titular_quitar_habilitacion',
    ]);
    expect(entries[1]!.metadata).toEqual({ enablementId: enabled.body.id });
    // Se puede volver a habilitar.
    expect((await enable(user.id)).status).toBe(200);
  });

  it('RF-009-21: motivo corto o ausente es 400; habilitar dos veces, 409; revocar sin habilitación, 409; usuario inexistente, 404', async () => {
    const user = await newUser();
    expect((await enable(user.id, { reason: 'corto' })).status).toBe(400);
    expect((await enable(user.id, {})).status).toBe(400);
    expect((await revoke(user.id)).status).toBe(409);
    expect((await enable(user.id)).status).toBe(200);
    expect((await enable(user.id)).status).toBe(409);
    expect((await revoke(user.id, { reason: 'corto' })).status).toBe(400);
    expect((await enable('00000000-0000-4000-8000-000000000000')).status).toBe(404);
    expect(await audit(user.id)).toHaveLength(1);
  });

  it('CA-009-01: un usuario normal no puede habilitar, revocar ni listar (403)', async () => {
    const user = await newUser();
    const other = await newUser();
    const as = (method: 'get' | 'post', url: string) =>
      t.http()[method](url).set('Authorization', `Bearer ${user.token}`);

    expect(
      (await as('post', `/admin/users/${other.id}/host-enablement`).send({ reason: REASON }))
        .status,
    ).toBe(403);
    expect(
      (await as('post', `/admin/users/${other.id}/host-enablement/revoke`).send({ reason: REVOKE }))
        .status,
    ).toBe(403);
    expect((await as('get', '/admin/host-enablements?active=true')).status).toBe(403);
    expect((await eligibility(other.token)).body).toMatchObject({ eligible: false });
  });

  it('RF-009-21 (CLI host:enable): habilita por correo, audita a nombre del administrador y no repite', async () => {
    const user = await newUser();
    const client = await t.db.connect();
    try {
      const first = await hostEnable(client, {
        email: user.email,
        reason: REASON,
        adminEmail: admin.email,
      });
      const again = await hostEnable(client, {
        email: user.email,
        reason: REASON,
        adminEmail: admin.email,
      });
      expect([first, again]).toEqual(['enabled', 'already']);
      await expect(
        hostEnable(client, { email: user.email, reason: 'corto' }),
      ).rejects.toBeInstanceOf(HostEnableError);
    } finally {
      client.release();
    }
    expect((await eligibility(user.token)).body).toMatchObject({
      eligible: true,
      source: 'manual',
    });
    const entries = await audit(user.id);
    expect(entries.map((e) => e.action)).toEqual(['titular_habilitar']);
  });
});
