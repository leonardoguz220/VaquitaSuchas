import { jest } from '@jest/globals';
import { FakeClock } from '../src/shared/clock/fake-clock.js';
import { InvitationsService } from '../src/modules/notifications/services/invitations.service.js';
import {
  MailDeliveryError,
  MailService,
  type MailMessage,
} from '../src/shared/ports/mail.service.js';
import { startAuthApp, type AuthTestApp, type TestUser } from './support/auth-app.js';
import { insertGroup } from './support/notifications-fixtures.js';

// Spec 005 (T026): invitación por correo y su límite. Requiere PostgreSQL; el proveedor de correo
// se simula con un espía sobre `MailService`.
describe('Invitaciones por correo (spec 005)', () => {
  let t: AuthTestApp;
  let clock: FakeClock;
  let owner: TestUser;
  let member: TestUser;
  let outsider: TestUser;
  let groupId: string;
  let ownerAuth: string;
  let memberAuth: string;
  let outsiderAuth: string;
  let send: jest.SpiedFunction<MailService['send']>;
  const sent = (): MailMessage[] => send.mock.calls.map((c) => c[0]);

  beforeAll(async () => {
    clock = new FakeClock('2026-10-20T15:00:00Z');
    t = await startAuthApp({ clock });
    send = jest.spyOn(t.app.get(MailService), 'send');
  }, 60_000);
  afterAll(async () => {
    await t?.close();
  }, 30_000);
  beforeEach(async () => {
    send.mockReset();
    send.mockResolvedValue(undefined);
    await t.db.query('DELETE FROM group_invitations');
    // rate_limit_events es de solo inserción: cada prueba usa un titular y un grupo nuevos.
    owner = await t.createUser();
    member = await t.createUser();
    outsider = await t.createUser();
    groupId = await insertGroup(t, owner.id, [member.id]);
    const token = async (u: TestUser) =>
      `Bearer ${(await t.login(u.email, u.password)).body.sessionToken as string}`;
    ownerAuth = await token(owner);
    memberAuth = await token(member);
    outsiderAuth = await token(outsider);
  });

  const invite = (email: unknown, auth = ownerAuth, id = groupId) =>
    t.http().post(`/groups/${id}/invitations`).set('Authorization', auth).send({ email });
  const inviteCode = async (): Promise<string> =>
    (
      await t.db.query<{ invite_code: string }>('SELECT invite_code FROM groups WHERE id = $1', [
        groupId,
      ])
    ).rows[0]!.invite_code;

  it('CA-005-14: el titular invita y el invitado recibe un correo con enlace y código', async () => {
    const res = await invite('  Invitado@Example.com ');
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ status: 'pendiente' });
    expect(send).not.toHaveBeenCalled();

    expect(await t.app.get(InvitationsService).deliverDue(clock.now())).toBe(1);

    const [mail] = sent();
    const code = await inviteCode();
    expect(mail?.to).toBe('invitado@example.com');
    expect(mail?.text).toContain(`/unirse?codigo=${code}`);
    expect(mail?.text).toContain(code);
    const row = await t.db.query<{ status: string }>('SELECT status FROM group_invitations');
    expect(row.rows).toEqual([{ status: 'enviada' }]);
  });

  it('CA-005-14: un fallo del proveedor se reintenta a los 5 minutos', async () => {
    await invite('invitado@example.com');
    const service = t.app.get(InvitationsService);
    send.mockRejectedValueOnce(new MailDeliveryError('caído'));
    await service.deliverDue(clock.now());
    const pending = await t.db.query<{ status: string; attempts: number }>(
      'SELECT status, attempts FROM group_invitations',
    );
    expect(pending.rows).toEqual([{ status: 'pendiente', attempts: 1 }]);

    clock.advance(5 * 60_000);
    await service.deliverDue(clock.now());
    expect(sent()).toHaveLength(2);
    expect(
      (await t.db.query('SELECT 1 FROM group_invitations WHERE status = $1', ['enviada'])).rowCount,
    ).toBe(1);
  });

  it('CA-005-14: la respuesta no cambia si el correo ya es de un miembro del grupo', async () => {
    const res = await invite(member.email);
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ status: 'pendiente' });
  });

  it('CA-005-14: correo inválido responde 400; miembro 403; ajeno 404; sin sesión 401', async () => {
    const bad = await invite('no-es-correo');
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe('VALIDATION_ERROR');
    expect((await invite('a@example.com', memberAuth)).status).toBe(403);
    expect((await invite('a@example.com', outsiderAuth)).status).toBe(404);
    expect(
      (await t.http().post(`/groups/${groupId}/invitations`).send({ email: 'a@example.com' }))
        .status,
    ).toBe(401);
  });

  it('CA-005-14: un grupo cerrado o congelado responde 422', async () => {
    await t.db.query("UPDATE groups SET frozen_at = now(), frozen_reason = 'titular_baneado'");
    expect((await invite('a@example.com')).body.code).toBe('GROUP_FROZEN');
    await t.db.query(
      "UPDATE groups SET frozen_at = NULL, frozen_reason = NULL, status = 'cerrado', closed_at = now()",
    );
    const closed = await invite('a@example.com');
    expect(closed.status).toBe(422);
    expect(closed.body.code).toBe('GROUP_CLOSED');
  });

  it('CA-005-16: la invitación número 11 en una hora se rechaza con retryAfterSeconds', async () => {
    for (let i = 0; i < 10; i++) {
      expect((await invite(`invitado${i}@example.com`)).status).toBe(202);
    }
    clock.advance(10 * 60_000);
    const res = await invite('invitado10@example.com');
    expect(res.status).toBe(429);
    expect(res.body.code).toBe('RATE_LIMITED');
    expect(res.body.details.retryAfterSeconds).toBe(50 * 60);
    expect((await t.db.query('SELECT 1 FROM group_invitations')).rowCount).toBe(10);
  });

  it('CA-005-16: pasada la hora se puede invitar de nuevo', async () => {
    for (let i = 0; i < 10; i++) await invite(`invitado${i}@example.com`);
    clock.advance(61 * 60_000);
    expect((await invite('otro@example.com')).status).toBe(202);
  });
});
