import { jest } from '@jest/globals';
import { FakeClock } from '../src/shared/clock/fake-clock.js';
import { MailService } from '../src/shared/ports/mail.service.js';
import { startAuthApp, type AuthTestApp, type TestUser } from './support/auth-app.js';
import { insertCharge, insertGroup, setName } from './support/notifications-fixtures.js';

// Spec 005 (T026): textos para WhatsApp. Requiere PostgreSQL. El servidor no envía nada.
describe('Textos para WhatsApp (spec 005)', () => {
  let t: AuthTestApp;
  let owner: TestUser;
  let member: TestUser;
  let outsider: TestUser;
  let groupId: string;
  let chargeId: string;
  let ownerAuth: string;
  let memberAuth: string;
  let outsiderAuth: string;
  let send: jest.SpiedFunction<MailService['send']>;

  beforeAll(async () => {
    t = await startAuthApp({ clock: new FakeClock('2026-10-20T15:00:00Z') });
    send = jest.spyOn(t.app.get(MailService), 'send');
    owner = await t.createUser();
    member = await t.createUser();
    outsider = await t.createUser();
    await setName(t, member.id, 'Mario Miembro');
    groupId = await insertGroup(t, owner.id, [member.id]);
    const token = async (u: TestUser) =>
      `Bearer ${(await t.login(u.email, u.password)).body.sessionToken as string}`;
    ownerAuth = await token(owner);
    memberAuth = await token(member);
    outsiderAuth = await token(outsider);
  }, 60_000);
  afterAll(async () => {
    await t?.close();
  }, 30_000);
  beforeEach(async () => {
    send.mockClear();
    await resetCharge();
  });

  const resetCharge = async (): Promise<void> => {
    await t.db.query('DELETE FROM charges');
    await t.db.query('DELETE FROM billing_cycles');
    chargeId = await insertCharge(t, groupId, owner.id, member.id, 3333);
  };
  const get = (url: string, auth = ownerAuth) => t.http().get(url).set('Authorization', auth);

  it('CA-005-17: invitation-share devuelve enlace y texto sin enviar nada desde el servidor', async () => {
    const code = (
      await t.db.query<{ invite_code: string }>('SELECT invite_code FROM groups WHERE id = $1', [
        groupId,
      ])
    ).rows[0]!.invite_code;

    const res = await get(`/groups/${groupId}/invitation-share`);

    expect(res.status).toBe(200);
    expect(res.body.inviteUrl).toBe(`http://localhost:3000/unirse?codigo=${code}`);
    expect(res.body.text).toContain(res.body.inviteUrl);
    expect(Object.keys(res.body).sort()).toEqual(['inviteUrl', 'text']);
    expect(send).not.toHaveBeenCalled();
    expect((await t.db.query('SELECT 1 FROM group_invitations')).rowCount).toBe(0);
  });

  it('CA-005-17: solo el titular; ajeno 404, miembro 403', async () => {
    expect((await get(`/groups/${groupId}/invitation-share`, memberAuth)).status).toBe(403);
    expect((await get(`/groups/${groupId}/invitation-share`, outsiderAuth)).status).toBe(404);
  });

  it('CA-005-18: el recordatorio va al celular del miembro con monto, período y vencimiento', async () => {
    const phone = (
      await t.db.query<{ phone_e164: string }>('SELECT phone_e164 FROM users WHERE id = $1', [
        member.id,
      ])
    ).rows[0]!.phone_e164;

    const res = await get(`/charges/${chargeId}/reminder-share`);

    expect(res.status).toBe(200);
    expect(res.body.phone).toBe(phone);
    expect(res.body.text).toContain('Bs 33,33');
    expect(res.body.text).toContain('octubre de 2026');
    expect(res.body.text).toContain('19 de octubre de 2026');
    expect(send).not.toHaveBeenCalled();
  });

  it('CA-005-18: también para cobros atrasados', async () => {
    await t.db.query("UPDATE charges SET status = 'atrasado'");
    expect((await get(`/charges/${chargeId}/reminder-share`)).status).toBe(200);
  });

  it('CA-005-18: cobros en revisión, pagados o cancelados responden 422 CHARGE_NOT_COLLECTABLE', async () => {
    const updates: Record<string, string> = {
      en_revision: "status = 'en_revision', first_submitted_at = now()",
      pagado: `status = 'pagado', paid_at = issued_at + interval '1 day', settled_by = '${owner.id}', settlement = 'manual'`,
      cancelado: `status = 'cancelado', cancelled_at = now(), cancelled_by = '${owner.id}', cancel_reason = 'Motivo de prueba'`,
    };
    for (const [status, set] of Object.entries(updates)) {
      await resetCharge();
      await t.db.query(`UPDATE charges SET ${set}`);
      const res = await get(`/charges/${chargeId}/reminder-share`);
      expect([status, res.status, res.body.code, res.body.details?.code]).toEqual([
        status,
        422,
        'BUSINESS_RULE',
        'CHARGE_NOT_COLLECTABLE',
      ]);
    }
  });

  it('CA-005-18: un miembro que ya salió del grupo responde 422', async () => {
    const other = await insertGroup(t, owner.id, [member.id], 'Spotify');
    const otherCharge = await insertCharge(t, other, owner.id, member.id, 3333);
    await t.db.query(
      "UPDATE group_members SET left_at = now(), left_reason = 'abandono' WHERE group_id = $1 AND user_id = $2",
      [other, member.id],
    );
    const res = await get(`/charges/${otherCharge}/reminder-share`);
    expect(res.status).toBe(422);
    expect(res.body.details.code).toBe('CHARGE_NOT_COLLECTABLE');
  });

  it('CA-005-18: solo el titular del grupo del cobro; ajeno 404, miembro 403, inexistente 404', async () => {
    expect((await get(`/charges/${chargeId}/reminder-share`, memberAuth)).status).toBe(403);
    expect((await get(`/charges/${chargeId}/reminder-share`, outsiderAuth)).status).toBe(404);
    expect((await get('/charges/00000000-0000-4000-8000-000000000000/reminder-share')).status).toBe(
      404,
    );
    expect((await t.http().get(`/charges/${chargeId}/reminder-share`)).status).toBe(401);
  });
});
