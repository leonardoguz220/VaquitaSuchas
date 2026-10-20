import { startAuthApp, type AuthTestApp } from './support/auth-app.js';
import {
  asAdmin,
  auditActions,
  createAdmin,
  insertGroup,
  openJoinRequest,
  randomPassword,
  statusOf,
  type AdminActor,
} from './support/admin-fixtures.js';

const REASON = 'Evidencia revisada por el equipo';

// Spec 009, US4: cola y resolución de reclamos de ingreso (RF-009-20, RF-010-23, RF-010-24).
// Las rutas de evidencia y resolución las implementa la spec 010 (join-requests); aquí se prueban
// con administradores reales. Requiere PostgreSQL.
describe('Reclamos en administración (spec 009)', () => {
  let t: AuthTestApp;
  let admin: AdminActor;

  const newUser = async () => {
    const password = randomPassword();
    const user = await t.createUser({ password });
    return { ...user, password };
  };

  /** Solicitud rechazada y reclamo abierto; devuelve los ids. */
  async function dispute(
    kind: 'pago_sin_ingreso' | 'comprobante_falso',
    options: { openedAt?: string; respond?: boolean } = {},
  ) {
    const host = await newUser();
    const applicant = await newUser();
    const groupId = await insertGroup(t, host.id);
    const requestId = await openJoinRequest(t, groupId, applicant.id);
    await t.db.query(
      `UPDATE join_requests SET status = 'rechazada', final_at = now(), final_reason = 'rechazo_titular',
              reject_reason = 'No recibí el pago', version = version + 1 WHERE id = $1`,
      [requestId],
    );
    const openedBy = kind === 'pago_sin_ingreso' ? applicant.id : host.id;
    const accused = kind === 'pago_sin_ingreso' ? host.id : applicant.id;
    const row = await t.db.query<{ id: string }>(
      `INSERT INTO join_disputes (request_id, kind, opened_by, accused_id, description, opened_at,
                                  response_text, responded_at)
       VALUES ($1, $2, $3, $4, 'Descripción del reclamo para el equipo', $5, $6, $7) RETURNING id`,
      [
        requestId,
        kind,
        openedBy,
        accused,
        options.openedAt ?? new Date().toISOString(),
        options.respond ? 'Respuesta de la otra parte al reclamo' : null,
        options.respond ? new Date().toISOString() : null,
      ],
    );
    return { id: row.rows[0]!.id, requestId, host, applicant, accusedId: accused, openedBy };
  }
  const resolve = (id: string, body: object, actor = admin) =>
    asAdmin(t, actor, 'post', `/admin/disputes/${id}/resolve`).send(body);
  const queue = (query = '', actor = admin) => asAdmin(t, actor, 'get', `/admin/disputes${query}`);

  beforeAll(async () => {
    t = await startAuthApp();
    admin = await createAdmin(t);
  }, 60_000);
  afterAll(async () => {
    await t?.close();
  }, 30_000);

  it('CA-009-25: estafa_confirmada banea al titular acusado y lo audita en la misma resolución', async () => {
    const d = await dispute('pago_sin_ingreso');

    const res = await resolve(d.id, { result: 'estafa_confirmada', reason: REASON });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'resuelto',
      resolution: { result: 'estafa_confirmada' },
    });
    expect(await statusOf(t, d.host.id)).toBe('baneado');
    expect(await statusOf(t, d.applicant.id)).toBe('activo');
    expect(await auditActions(t, d.id)).toEqual(['reclamo_resolver']);
    expect(await auditActions(t, d.host.id)).toEqual(['usuario_banear']);
  });

  it('CA-009-26: sin_falta no cambia ninguna cuenta ni crea baneos', async () => {
    const d = await dispute('pago_sin_ingreso');

    const res = await resolve(d.id, { result: 'sin_falta', reason: REASON });

    expect(res.status).toBe(200);
    expect(await statusOf(t, d.host.id)).toBe('activo');
    expect(await statusOf(t, d.applicant.id)).toBe('activo');
    expect(
      (
        await t.db.query('SELECT 1 FROM bans WHERE user_id = ANY($1::uuid[])', [
          [d.host.id, d.applicant.id],
        ])
      ).rowCount,
    ).toBe(0);
    expect(await auditActions(t, d.id)).toEqual(['reclamo_resolver']);
  });

  it('CA-009-30: comprobante falso confirmado banea al solicitante, no al titular', async () => {
    const d = await dispute('comprobante_falso');

    expect((await resolve(d.id, { result: 'estafa_confirmada', reason: REASON })).status).toBe(200);

    expect(await statusOf(t, d.applicant.id)).toBe('baneado');
    expect(await statusOf(t, d.host.id)).toBe('activo');
  });

  it('DISPUTE_NOT_OPEN (409 INVALID_TRANSITION): resolver dos veces no repite el baneo ni la auditoría', async () => {
    const d = await dispute('pago_sin_ingreso');
    await resolve(d.id, { result: 'sin_falta', reason: REASON });

    const again = await resolve(d.id, { result: 'estafa_confirmada', reason: REASON });

    expect(again.status).toBe(409);
    expect(again.body.code).toBe('INVALID_TRANSITION');
    expect(await statusOf(t, d.host.id)).toBe('activo');
    expect(await auditActions(t, d.id)).toEqual(['reclamo_resolver']);
  });

  it('CA-009-27: la evidencia queda auditada antes de devolverse; sobre un reclamo resuelto es 403', async () => {
    const d = await dispute('pago_sin_ingreso');

    const res = await asAdmin(t, admin, 'get', `/admin/disputes/${d.id}/evidence`);

    expect(res.status).toBe(200);
    expect(res.body.dispute).toMatchObject({ id: d.id });
    expect(await auditActions(t, d.id)).toEqual(['reclamo_abrir_evidencia']);

    await resolve(d.id, { result: 'sin_falta', reason: REASON });
    const closed = await asAdmin(t, admin, 'get', `/admin/disputes/${d.id}/evidence`);
    expect(closed.status).toBe(403);
    expect(await auditActions(t, d.id)).toEqual(['reclamo_abrir_evidencia', 'reclamo_resolver']);
  });

  it('CA-009-01: un usuario sin rol de administrador recibe 403 en cola, evidencia y resolución', async () => {
    const d = await dispute('pago_sin_ingreso');
    const token = (await t.login(d.applicant.email, d.applicant.password)).body
      .sessionToken as string;
    const as = (method: 'get' | 'post', url: string) =>
      t.http()[method](url).set('Authorization', `Bearer ${token}`);

    expect((await as('get', '/admin/disputes?status=abierto')).status).toBe(403);
    expect((await as('get', `/admin/disputes/${d.id}/evidence`)).status).toBe(403);
    expect(
      (
        await as('post', `/admin/disputes/${d.id}/resolve`).send({
          result: 'sin_falta',
          reason: REASON,
        })
      ).status,
    ).toBe(403);
    expect((await t.http().get('/admin/disputes')).status).toBe(401);
    expect(await auditActions(t, d.id)).toEqual([]);
  });

  describe('cola GET /admin/disputes (RF-009-20)', () => {
    it('RF-009-20: lista solo los abiertos, con tipo, partes, fechas y hasResponse, sin chat ni comprobante', async () => {
      const open = await dispute('pago_sin_ingreso', { respond: true });
      const done = await dispute('comprobante_falso');
      await resolve(done.id, { result: 'sin_falta', reason: REASON });

      const res = await queue('?status=abierto');

      expect(res.status).toBe(200);
      const ids = res.body.items.map((i: { id: string }) => i.id);
      expect(ids).toContain(open.id);
      expect(ids).not.toContain(done.id);
      const row = res.body.items.find((i: { id: string }) => i.id === open.id);
      expect(row).toMatchObject({
        id: open.id,
        requestId: open.requestId,
        kind: 'pago_sin_ingreso',
        status: 'abierto',
        hasResponse: true,
        openedBy: { userId: open.openedBy },
        accused: { userId: open.accusedId },
      });
      expect(typeof row.openedAt).toBe('string');
      for (const forbidden of ['messages', 'proof', 'evidenceFiles', 'description']) {
        expect(row).not.toHaveProperty(forbidden);
      }
      expect(res.body).toHaveProperty('nextCursor');
    });

    it('RF-009-20: los abiertos van primero (más antiguos antes) y la paginación por cursor no repite ni omite', async () => {
      const old = await dispute('pago_sin_ingreso', { openedAt: '2026-01-01T00:00:00Z' });
      const resolved = await dispute('pago_sin_ingreso', { openedAt: '2025-01-01T00:00:00Z' });
      await resolve(resolved.id, { result: 'sin_falta', reason: REASON });

      const all: string[] = [];
      let cursor: string | null = null;
      for (let page = 0; page < 20; page += 1) {
        const res = await queue(`?limit=2${cursor ? `&cursor=${cursor}` : ''}`);
        expect(res.status).toBe(200);
        all.push(...res.body.items.map((i: { id: string }) => i.id));
        cursor = res.body.nextCursor;
        if (!cursor) break;
      }

      expect(new Set(all).size).toBe(all.length);
      expect(all.indexOf(old.id)).toBeGreaterThanOrEqual(0);
      expect(all.indexOf(old.id)).toBeLessThan(all.indexOf(resolved.id));
      const statuses = (
        await t.db.query<{ id: string; status: string }>(
          'SELECT id, status FROM join_disputes WHERE id = ANY($1::uuid[])',
          [all],
        )
      ).rows;
      const order = all.map((id) => statuses.find((s) => s.id === id)!.status);
      expect(order.lastIndexOf('abierto')).toBeLessThan(order.indexOf('resuelto'));
    });

    it('RF-009-20: parámetros inválidos responden 400', async () => {
      expect((await queue('?status=otro')).status).toBe(400);
      expect((await queue('?limit=0')).status).toBe(400);
      expect((await queue('?cursor=basura')).status).toBe(400);
    });
  });
});
