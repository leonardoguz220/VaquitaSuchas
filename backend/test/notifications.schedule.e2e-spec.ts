import { FakeClock } from '../src/shared/clock/fake-clock.js';
import { JobRegistry } from '../src/shared/jobs/job-registry.js';
import { ScheduleService } from '../src/modules/notifications/services/schedule.service.js';
import { startAuthApp, type AuthTestApp, type TestUser } from './support/auth-app.js';
import {
  insertCharge,
  insertGroup,
  notificationsOf,
  setName,
} from './support/notifications-fixtures.js';

// Spec 005 (T015): avisos programados por la tarea `notifications.schedule`. Requiere PostgreSQL.
// 12:00 UTC = 08:00 en La Paz. El grupo de prueba corta el día 15 y su cobro vence el 19 a las 00:00.
describe('Avisos programados (spec 005)', () => {
  let t: AuthTestApp;
  let schedule: ScheduleService;
  let owner: TestUser;
  let member: TestUser;
  let other: TestUser;
  let groupId: string;

  beforeAll(async () => {
    const clock = new FakeClock('2026-10-13T12:00:00Z');
    t = await startAuthApp({ clock });
    schedule = t.app.get(ScheduleService);
    owner = await t.createUser();
    member = await t.createUser();
    other = await t.createUser();
    await setName(t, member.id, 'Mario Miembro');
    groupId = await insertGroup(t, owner.id, [member.id, other.id]);
  }, 60_000);
  afterAll(async () => {
    await t?.close();
  }, 30_000);
  beforeEach(async () => {
    for (const table of ['notification_deliveries', 'notifications', 'receipts', 'charges']) {
      await t.db.query(`DELETE FROM ${table}`);
    }
    await t.db.query('DELETE FROM billing_cycles');
    await t.db.query("DELETE FROM job_runs WHERE job_name LIKE 'notifications.%'");
  });

  // El servicio recibe `now` por parámetro (como la tarea): cada prueba fija su propio instante.
  const run = (iso: string): Promise<number> => schedule.run(new Date(iso));
  const count = async (type: string, userId?: string): Promise<number> => {
    const r = await t.db.query<{ n: string }>(
      `SELECT count(*) AS n FROM notifications WHERE type = $1 AND ($2::uuid IS NULL OR user_id = $2)`,
      [type, userId ?? null],
    );
    return Number(r.rows[0]!.n);
  };
  const markPaid = (chargeId: string): Promise<unknown> =>
    t.db.query(
      `UPDATE charges SET status = 'pagado', paid_at = '2026-10-16T15:00:00Z', settled_by = $2,
              settlement = 'manual' WHERE id = $1`,
      [chargeId, owner.id],
    );
  const putInReview = async (chargeId: string, uploadedAt: string): Promise<void> => {
    await t.db.query(`UPDATE charges SET status = 'en_revision' WHERE id = $1`, [chargeId]);
    await t.db.query(
      `INSERT INTO receipts (charge_id, uploaded_by, uploaded_at, file_key, mime, size_bytes, method, reference)
       VALUES ($1, $2, $3, 'k/' || gen_random_uuid()::text, 'image/png', 10, 'qr', 'ref1')`,
      [chargeId, member.id, uploadedAt],
    );
  };

  it('CA-005-02: el día 13 (corte el 15) cada miembro recibe el aviso previo con monto estimado', async () => {
    expect(await run('2026-10-13T12:00:00Z')).toBe(2);
    const [n] = await notificationsOf(t, member.id);
    expect(n).toMatchObject({ type: 'aviso_previo', category: 'recordatorios' });
    expect(n!.body).toContain('estimado');
    expect(n!.body).toContain('Bs 33,33');
    expect(n!.link).toBe(`/grupos/${groupId}`);
    expect(await count('aviso_previo', other.id)).toBe(1);
    // RN-005-03: el titular no recibe avisos de cobro como miembro.
    expect(await notificationsOf(t, owner.id)).toHaveLength(0);
  });

  it('CA-005-02: el día 12 aún no hay aviso previo, y antes de las 08:00 la parte diaria no actúa', async () => {
    expect(await run('2026-10-12T12:00:00Z')).toBe(0);
    expect(await run('2026-10-13T11:59:00Z')).toBe(0);
    expect(await count('aviso_previo')).toBe(0);
  });

  it('RF-005-19: tras una caída el servicio recupera el aviso previo que faltó', async () => {
    // No corrió el día 13; vuelve el día 14.
    expect(await run('2026-10-14T15:00:00Z')).toBe(2);
    expect(await count('aviso_previo', member.id)).toBe(1);
  });

  it('CA-005-03: un cobro pendiente que vence mañana genera recordatorio al miembro', async () => {
    const chargeId = await insertCharge(t, groupId, owner.id, member.id, 3333);
    await run('2026-10-18T12:00:00Z');
    const [n] = await notificationsOf(t, member.id);
    expect(n).toMatchObject({ type: 'recordatorio_vencimiento', link: `/cobros/${chargeId}` });
    expect(n!.body).toContain('Bs 33,33');
    expect(n!.body).toContain('19 de octubre de 2026');
  });

  it('CA-005-04: un cobro pagado no genera recordatorio', async () => {
    const chargeId = await insertCharge(t, groupId, owner.id, member.id, 3333);
    await markPaid(chargeId);
    await run('2026-10-18T12:00:00Z');
    expect(await count('recordatorio_vencimiento')).toBe(0);
  });

  it('CA-005-06: un cobro atrasado de un miembro retirado no genera recordatorios en 12 días', async () => {
    const leaver = await t.createUser();
    const ownGroup = await insertGroup(t, owner.id, [leaver.id], 'Grupo con retiro');
    const chargeId = await insertCharge(t, ownGroup, owner.id, leaver.id, 3333);
    await t.db.query(`UPDATE charges SET status = 'atrasado' WHERE id = $1`, [chargeId]);
    await t.db.query(
      `UPDATE group_members SET left_at = '2026-10-19T04:00:00Z', left_reason = 'mora'
        WHERE user_id = $1 AND group_id = $2`,
      [leaver.id, ownGroup],
    );
    for (let day = 19; day <= 30; day++) {
      await run(`2026-10-${day}T12:00:00Z`);
    }
    expect(await notificationsOf(t, leaver.id)).toHaveLength(0);
    expect(await count('recordatorio_vencimiento')).toBe(0);
  });

  it('CA-005-08: más de 48 horas en revisión → un solo recordatorio al titular', async () => {
    const chargeId = await insertCharge(t, groupId, owner.id, member.id, 3333);
    await putInReview(chargeId, '2026-10-16T12:00:00Z');
    expect(await run('2026-10-18T11:00:00Z')).toBe(0);
    expect(await run('2026-10-18T12:05:00Z')).toBe(1);
    await run('2026-10-18T12:10:00Z');
    await run('2026-10-19T12:10:00Z');
    expect(await count('comprobante_pendiente_48h', owner.id)).toBe(1);
    const [n] = await notificationsOf(t, owner.id);
    expect(n!.body).toContain('Mario Miembro');
  });

  it('CA-005-08: si el cobro se paga antes, no hay recordatorio de 48 horas', async () => {
    const chargeId = await insertCharge(t, groupId, owner.id, member.id, 3333);
    await putInReview(chargeId, '2026-10-16T12:00:00Z');
    await markPaid(chargeId);
    await run('2026-10-19T12:00:00Z');
    expect(await count('comprobante_pendiente_48h')).toBe(0);
  });

  it('CA-005-10: la tarea diaria ejecutada dos veces no duplica avisos', async () => {
    await run('2026-10-13T12:00:00Z');
    expect(await run('2026-10-13T12:05:00Z')).toBe(0);
    const markers = await t.db.query(
      "SELECT 1 FROM job_runs WHERE job_name = 'notifications.schedule.daily' AND status = 'ok'",
    );
    expect(markers.rowCount).toBe(1);

    // Aunque se pierda la marca, las claves únicas impiden duplicar (RN-005-01).
    await t.db.query("DELETE FROM job_runs WHERE job_name = 'notifications.schedule.daily'");
    expect(await run('2026-10-13T13:00:00Z')).toBe(0);
    expect(await count('aviso_previo')).toBe(2);
  });

  it('RF-005-19: las tareas se registran en el registro de jobs', () => {
    const registry = t.app.get(JobRegistry, { strict: false });
    expect(registry.get('notifications.schedule')).toBeDefined();
    expect(registry.get('notifications.deliver')).toBeDefined();
  });
});
