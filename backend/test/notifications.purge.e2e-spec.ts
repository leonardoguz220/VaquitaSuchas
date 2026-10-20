import { FakeClock } from '../src/shared/clock/fake-clock.js';
import { JobRegistry } from '../src/shared/jobs/job-registry.js';
import { PurgeService } from '../src/modules/notifications/services/purge.service.js';
import { startAuthApp, type AuthTestApp, type TestUser } from './support/auth-app.js';
import { insertGroup } from './support/notifications-fixtures.js';

// Spec 005 (T022): limpieza diaria de avisos (90 días) y direcciones de invitaciones (30 días).
// Requiere PostgreSQL.
describe('Limpieza de avisos e invitaciones (spec 005)', () => {
  const NOW = '2026-10-20T15:00:00Z';
  let t: AuthTestApp;
  let owner: TestUser;
  let groupId: string;
  let seq = 0;

  beforeAll(async () => {
    t = await startAuthApp({ clock: new FakeClock(NOW) });
    owner = await t.createUser();
    groupId = await insertGroup(t, owner.id, []);
  }, 60_000);
  afterAll(async () => {
    await t?.close();
  }, 30_000);
  beforeEach(async () => {
    await t.db.query('DELETE FROM notification_deliveries');
    await t.db.query('DELETE FROM notifications');
    await t.db.query('DELETE FROM group_invitations');
  });

  const daysAgo = (days: number, extraMinutes = 0): string =>
    new Date(Date.parse(NOW) - days * 86_400_000 - extraMinutes * 60_000).toISOString();

  async function notification(createdAt: string, withDelivery = true): Promise<string> {
    seq += 1;
    const n = await t.db.query<{ id: string }>(
      `INSERT INTO notifications (user_id, type, category, title, body, link, dedupe_key, created_at)
       VALUES ($1, 'cobro_generado', 'recordatorios', 'Titulo', 'Cuerpo', '/cobros/x', $2, $3)
       RETURNING id`,
      [owner.id, `purge-${seq}`, createdAt],
    );
    const id = n.rows[0]!.id;
    if (withDelivery) {
      await t.db.query(
        `INSERT INTO notification_deliveries (notification_id, channel, status, respect_window, next_attempt_at)
         VALUES ($1, 'email', 'sent', false, $2)`,
        [id, createdAt],
      );
    }
    return id;
  }
  async function invitation(createdAt: string): Promise<void> {
    await t.db.query(
      `INSERT INTO group_invitations (group_id, invited_by, recipient_email, next_attempt_at, created_at)
       VALUES ($1, $2, $3, $4, $4)`,
      [groupId, owner.id, `invitado${(seq += 1)}@example.com`, createdAt],
    );
  }
  const count = async (table: string): Promise<number> =>
    Number(
      (await t.db.query<{ n: string }>(`SELECT count(*)::text AS n FROM ${table}`)).rows[0]!.n,
    );

  it('CA-005-23: elimina avisos de más de 90 días con sus envíos y conserva los recientes', async () => {
    await notification(daysAgo(91));
    await notification(daysAgo(120), false);
    const keep = await notification(daysAgo(89));

    const removed = await t.app.get(PurgeService).run(new Date(NOW));

    expect(removed).toBe(2);
    const left = await t.db.query<{ id: string }>('SELECT id FROM notifications');
    expect(left.rows.map((r) => r.id)).toEqual([keep]);
    expect(await count('notification_deliveries')).toBe(1);
  });

  it('CA-005-23: borra las direcciones de invitaciones de más de 30 días', async () => {
    await invitation(daysAgo(31));
    await invitation(daysAgo(29));

    expect(await t.app.get(PurgeService).run(new Date(NOW))).toBe(1);

    expect(await count('group_invitations')).toBe(1);
  });

  it('CA-005-23: la tarea notifications.purge está registrada, es diaria y se puede repetir', async () => {
    await notification(daysAgo(100));
    const job = t.app
      .get(JobRegistry)
      .list()
      .find((j) => j.name === 'notifications.purge');
    expect(job?.intervalSeconds).toBe(86_400);
    const ctx = { now: new Date(NOW), trigger: 'manual' as const, db: undefined as never };
    expect(await job!.run(ctx)).toBe(1);
    expect(await job!.run(ctx)).toBe(0);
  });
});
