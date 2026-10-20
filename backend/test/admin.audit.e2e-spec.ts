import { DbService } from '../src/shared/db/db.service.js';
import { AuditService } from '../src/modules/admin/services/audit.service.js';
import { AUDIT_PORT, type AuditPort } from '../src/modules/join-requests/ports/audit.port.js';
import { startAuthApp, type AuthTestApp } from './support/auth-app.js';

// Spec 009, US2: log de auditoría de solo anexado (RF-009-18, RNF-009-03, RNF-009-05).
describe('Auditoría de administración (spec 009)', () => {
  let t: AuthTestApp;
  let db: DbService;
  let audit: AuditService;
  let adminId: string;
  let otherAdminId: string;
  let targetId: string;
  let token: string;

  const list = (query = '') =>
    t.http().get(`/admin/audit-log${query}`).set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    t = await startAuthApp();
    db = t.app.get(DbService);
    audit = t.app.get(AuditService);
    const admin = await t.createUser();
    const other = await t.createUser();
    const target = await t.createUser();
    adminId = admin.id;
    otherAdminId = other.id;
    targetId = target.id;
    await t.db.query(`UPDATE users SET role = 'admin' WHERE id = ANY($1)`, [
      [adminId, otherAdminId],
    ]);
    token = (await t.login(admin.email, admin.password)).body.sessionToken as string;
  }, 60_000);
  afterAll(async () => {
    await t?.close();
  }, 30_000);

  it('RF-009-18: el puerto AuditPort de la spec 010 lo resuelve el servicio real', () => {
    expect(t.app.get<AuditPort>(AUDIT_PORT)).toBe(audit);
  });

  it('CA-009-18: una acción confirmada deja su registro y GET /admin/audit-log lo devuelve', async () => {
    await db.withTransaction(async (tx) => {
      await audit.record(tx, {
        actorId: adminId,
        action: 'usuario_suspender',
        targetType: 'user',
        targetId,
        reason: 'Pagos reportados como falsos',
        metadata: { previousStatus: 'activo' },
      });
    });
    const res = await list('?action=usuario_suspender');
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({
      adminId,
      action: 'usuario_suspender',
      targetType: 'user',
      targetId,
      reason: 'Pagos reportados como falsos',
      metadata: { previousStatus: 'activo' },
    });
    expect(res.body.nextCursor).toBeNull();
  });

  it('CA-009-18 (misma transacción): si la acción se revierte, el registro también', async () => {
    await expect(
      db.withTransaction(async (tx) => {
        await audit.record(tx, {
          actorId: adminId,
          action: 'usuario_banear',
          targetType: 'user',
          targetId,
        });
        throw new Error('la acción falló');
      }),
    ).rejects.toThrow('la acción falló');
    expect((await list('?action=usuario_banear')).body.items).toEqual([]);
  });

  it('RNF-009-03: los metadatos no guardan CI, contraseñas, tokens ni chats', async () => {
    await db.withTransaction(async (tx) => {
      await audit.record(tx, {
        actorId: adminId,
        action: 'reclamo_abrir_evidencia',
        targetType: 'join_dispute',
        targetId,
        metadata: { disputeId: targetId, ci: '1234567', passwordHash: 'x', chatMessage: 'hola' },
      });
    });
    const res = await list('?action=reclamo_abrir_evidencia');
    expect(res.body.items[0].metadata).toEqual({ disputeId: targetId });
    const stored = await t.db.query(
      `SELECT metadata FROM admin_audit_log WHERE action = 'reclamo_abrir_evidencia'`,
    );
    expect(JSON.stringify(stored.rows)).not.toContain('1234567');
  });

  it('CA-010-29: acepta los nombres punteados que usa la spec 010', async () => {
    await db.withTransaction(async (tx) => {
      await audit.record(tx, {
        actorId: otherAdminId,
        action: 'dispute.resolve',
        targetType: 'dispute',
        targetId,
      });
    });
    const res = await list('?action=reclamo_resolver');
    expect(res.body.items[0]).toMatchObject({ targetType: 'join_dispute' });
  });

  it('CA-009-19: el log no se edita ni se borra (la base lo impide)', async () => {
    await expect(
      t.db.query(`UPDATE admin_audit_log SET reason = 'cambiado por error'`),
    ).rejects.toThrow();
    await expect(t.db.query(`DELETE FROM admin_audit_log`)).rejects.toThrow();
  });

  it('CA-009-19: la API no expone PUT, PATCH ni DELETE sobre el log', async () => {
    for (const verb of ['put', 'patch', 'delete', 'post'] as const) {
      const res = await t
        .http()
        [verb]('/admin/audit-log')
        .set('Authorization', `Bearer ${token}`)
        .send({});
      expect(res.status).toBe(404);
    }
  });

  it('RF-009-18: filtra por administrador, tipo y objetivo', async () => {
    expect((await list(`?adminId=${otherAdminId}`)).body.items).toHaveLength(1);
    expect((await list(`?targetType=join_dispute&targetId=${targetId}`)).body.items).toHaveLength(
      2,
    );
    expect((await list(`?adminId=${adminId}&targetType=ban`)).body.items).toEqual([]);
  });

  it('RF-009-18: filtra por rango de fechas', async () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const past = new Date(Date.now() - 86_400_000).toISOString();
    expect((await list(`?from=${encodeURIComponent(future)}`)).body.items).toEqual([]);
    expect((await list(`?from=${encodeURIComponent(past)}`)).body.items.length).toBeGreaterThan(0);
    expect((await list(`?to=${encodeURIComponent(past)}`)).body.items).toEqual([]);
  });

  it('RF-009-18: pagina con cursor sin repetir ni omitir registros, más recientes primero', async () => {
    await db.withTransaction(async (tx) => {
      for (let i = 0; i < 5; i += 1) {
        await audit.record(tx, {
          actorId: adminId,
          action: 'catalogo_editar',
          targetType: 'catalog_plan',
          targetId,
          metadata: { serviceId: targetId, n: i },
        });
      }
    });
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const res = await list(`?action=catalogo_editar&limit=2${cursor ? `&cursor=${cursor}` : ''}`);
      expect(res.status).toBe(200);
      seen.push(...res.body.items.map((i: { id: string }) => i.id));
      cursor = res.body.nextCursor;
      pages += 1;
    } while (cursor && pages < 10);
    expect(pages).toBe(3);
    expect(new Set(seen).size).toBe(5);
    const all = await list('?action=catalogo_editar&limit=100');
    expect(all.body.items.map((i: { id: string }) => i.id)).toEqual(seen);
  });

  it('parámetros inválidos responden 400 con el formato uniforme', async () => {
    for (const query of [
      '?action=otra',
      '?limit=0',
      '?limit=101',
      '?cursor=basura',
      '?adminId=x',
      '?from=ayer',
    ]) {
      const res = await list(query);
      expect({ query, status: res.status, code: res.body.code }).toEqual({
        query,
        status: 400,
        code: 'VALIDATION_ERROR',
      });
    }
  });
});
