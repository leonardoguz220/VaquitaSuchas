import { jest } from '@jest/globals';
import { Logger } from '@nestjs/common';
import request from 'supertest';
import { BillingHarness, NOW, type TestGroup } from './support/billing-harness.js';
import { seedFinalRequest, type DisputeScenario } from './support/disputes-fixtures.js';
import { setClock } from './support/join-requests-fixtures.js';
import { JoinRequestsModule } from '../src/modules/join-requests/join-requests.module.js';
import { pngBytes } from './support/receipt-files.js';

const REASON = 'Evidencia revisada por el equipo';

interface AuditRow {
  action: string;
  target_type: string;
  target_id: string;
  reason: string | null;
  metadata: Record<string, unknown>;
}

// Evidencia y resolución de reclamos por administración (spec 010 US6, T037/T038).
describe('Reclamos: administración (spec 010 + 009)', () => {
  const harness = new BillingHarness({ imports: [JoinRequestsModule] });
  let group: TestGroup;
  let applicant: string;
  let admin: string;

  const http = (): ReturnType<typeof request> => request(harness.app.getHttpServer());
  const as = (test: request.Test, userId: string): request.Test =>
    test.set('Authorization', `Bearer ${harness.token(userId)}`);
  const evidence = (userId: string, disputeId: string): request.Test =>
    as(http().get(`/admin/disputes/${disputeId}/evidence`), userId);
  const resolve = (
    userId: string,
    disputeId: string,
    body: Record<string, unknown>,
  ): request.Test => as(http().post(`/admin/disputes/${disputeId}/resolve`), userId).send(body);
  const audit = async (targetId: string): Promise<AuditRow[]> =>
    (
      await harness.pool.query<AuditRow>(
        `SELECT action, target_type, target_id, reason, metadata FROM admin_audit_log
          WHERE target_id = $1 ORDER BY occurred_at, id`,
        [targetId],
      )
    ).rows;
  const statusOf = async (userId: string): Promise<string> =>
    (
      await harness.pool.query<{ status: string }>('SELECT status FROM users WHERE id = $1', [
        userId,
      ])
    ).rows[0]?.status as string;

  /** Solicitud final + reclamo abierto por la parte que corresponde. */
  async function dispute(scenario: DisputeScenario): Promise<{ requestId: string; id: string }> {
    const requestId = await seedFinalRequest(harness, group, applicant, scenario);
    const opener = scenario === 'rechazada_falso' ? group.ownerId : applicant;
    const created = await as(http().post(`/join-requests/${requestId}/disputes`), opener)
      .field('description', 'Descripción del reclamo para el equipo')
      .attach('evidence', pngBytes(512), { filename: 'prueba.png' })
      .expect(201);
    return { requestId, id: created.body.id };
  }

  beforeAll(() => harness.start(), 60_000);
  afterAll(() => harness.stop(), 30_000);
  beforeEach(async () => {
    await harness.pool.query('DELETE FROM banned_identities');
    await harness.pool.query('DELETE FROM bans');
    group = await harness.createGroup({ members: 1 });
    applicant = await harness.insertUser();
    admin = await harness.insertUser('Admin');
    await harness.pool.query(`UPDATE users SET role = 'admin' WHERE id = $1`, [admin]);
    harness.storage.files.clear();
    harness.storage.failSignedUrl = false;
  });
  afterEach(() => {
    setClock(harness, NOW);
    jest.restoreAllMocks();
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  it('CA-010-29: el administrador ve línea de tiempo, chat y comprobante, y cada apertura queda auditada', async () => {
    const { requestId, id } = await dispute('expirada_sin_respuesta');
    await harness.pool.query(
      `INSERT INTO join_messages (request_id, sender_id, body) VALUES ($1, $2, 'Ya transferí')`,
      [requestId, applicant],
    );
    const res = await evidence(admin, id).expect(200);
    expect(res.body.dispute).toMatchObject({ id, kind: 'pago_sin_ingreso' });
    expect(res.body.messages.map((m: { body: string }) => m.body)).toEqual(['Ya transferí']);
    expect(res.body.proof).toMatchObject({ reference: 'REF-1', method: 'qr' });
    expect(res.body.request.quote).toMatchObject({ amountCents: 3333 });
    expect(Array.isArray(res.body.timeline)).toBe(true);
    expect(res.body.evidenceFiles.description.url).toBeTruthy();

    await evidence(admin, id).expect(200);
    const rows = await audit(id);
    expect(rows.map((r) => r.action)).toEqual([
      'reclamo_abrir_evidencia',
      'reclamo_abrir_evidencia',
    ]);
    expect(rows[0]).toMatchObject({ target_type: 'join_dispute' });
    expect(rows[0]?.metadata).toEqual({ disputeId: id, requestId });
  });

  it('CA-010-29: las URL firmadas duran 10 minutos como máximo', async () => {
    const { id } = await dispute('rechazada');
    const spy = jest.spyOn(harness.storage, 'signedUrl');
    await evidence(admin, id).expect(200);
    expect(spy).toHaveBeenCalled();
    for (const [, ttl] of spy.mock.calls) expect(ttl).toBeLessThanOrEqual(600);
  });

  it('CA-010-29: un usuario normal, el solicitante y el titular reciben 403 y no queda auditoría', async () => {
    const { id } = await dispute('rechazada');
    for (const user of [applicant, group.ownerId, group.memberIds[0] as string]) {
      await evidence(user, id).expect(403);
      await resolve(user, id, { result: 'sin_falta', reason: REASON }).expect(403);
    }
    await http().get(`/admin/disputes/${id}/evidence`).expect(401);
    expect(await audit(id)).toEqual([]);
    const row = await harness.pool.query<{ status: string }>(
      'SELECT status FROM join_disputes WHERE id = $1',
      [id],
    );
    expect(row.rows[0]?.status).toBe('abierto');
  });

  it('CA-010-29: sobre un reclamo resuelto o inexistente no hay evidencia (403 / 404) y no se audita', async () => {
    const { id } = await dispute('rechazada');
    await resolve(admin, id, { result: 'sin_falta', reason: REASON }).expect(200);
    await evidence(admin, id).expect(403);
    await evidence(admin, '00000000-0000-4000-8000-000000000000').expect(404);
    expect((await audit(id)).map((r) => r.action)).toEqual(['reclamo_resolver']);
  });

  it('CA-010-30: estafa_confirmada banea al titular acusado, bloquea sus identidades y ambas partes ven la decisión', async () => {
    const { requestId, id } = await dispute('expirada_sin_respuesta');
    const res = await resolve(admin, id, { result: 'estafa_confirmada', reason: REASON }).expect(
      200,
    );
    expect(res.body).toMatchObject({
      status: 'resuelto',
      resolution: { result: 'estafa_confirmada', reason: REASON },
    });
    expect(await statusOf(group.ownerId)).toBe('baneado');
    expect(await statusOf(applicant)).toBe('activo');
    const ban = await harness.pool.query<{ id: string; source: string; dispute_id: string }>(
      'SELECT id, source, dispute_id FROM bans WHERE user_id = $1',
      [group.ownerId],
    );
    expect(ban.rows[0]).toMatchObject({ source: 'reclamo', dispute_id: id });
    const blocked = await harness.pool.query('SELECT 1 FROM banned_identities WHERE ban_ref = $1', [
      ban.rows[0]?.id,
    ]);
    expect(blocked.rowCount).toBeGreaterThan(0);

    const rows = await audit(id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ action: 'reclamo_resolver', reason: REASON });
    expect(rows[0]?.metadata).toEqual({
      disputeId: id,
      requestId,
      outcome: 'estafa_confirmada',
      banId: ban.rows[0]?.id,
    });
    expect((await audit(group.ownerId)).map((r) => r.action)).toContain('usuario_banear');

    // El titular baneado ya no tiene sesión; el solicitante ve la resolución (RF-010-24).
    const seen = await as(http().get(`/join-requests/${requestId}/disputes`), applicant).expect(
      200,
    );
    expect(seen.body.items[0].resolution).toMatchObject({ result: 'estafa_confirmada' });
  });

  it('CA-010-31: sin_falta no cambia ninguna cuenta y ambas partes ven la decisión', async () => {
    const { requestId, id } = await dispute('rechazada');
    await resolve(admin, id, { result: 'sin_falta', reason: REASON }).expect(200);
    expect(await statusOf(group.ownerId)).toBe('activo');
    expect(await statusOf(applicant)).toBe('activo');
    expect((await harness.pool.query('SELECT 1 FROM bans')).rowCount).toBe(0);
    for (const viewer of [applicant, group.ownerId]) {
      const seen = await as(http().get(`/join-requests/${requestId}/disputes`), viewer).expect(200);
      expect(seen.body.items[0]).toMatchObject({
        status: 'resuelto',
        resolution: { result: 'sin_falta', reason: REASON },
      });
    }
    // Un reclamo no devuelve dinero ni cambia el estado de la solicitud (RN-010-07).
    const state = await harness.pool.query<{ status: string }>(
      'SELECT status FROM join_requests WHERE id = $1',
      [requestId],
    );
    expect(state.rows[0]?.status).toBe('rechazada');
  });

  it('CA-010-43: comprobante falso confirmado banea al solicitante y bloquea sus identidades', async () => {
    const { id } = await dispute('rechazada_falso');
    await resolve(admin, id, { result: 'estafa_confirmada', reason: REASON }).expect(200);
    expect(await statusOf(applicant)).toBe('baneado');
    expect(await statusOf(group.ownerId)).toBe('activo');
    const ban = await harness.pool.query<{ id: string }>('SELECT id FROM bans WHERE user_id = $1', [
      applicant,
    ]);
    const blocked = await harness.pool.query('SELECT 1 FROM banned_identities WHERE ban_ref = $1', [
      ban.rows[0]?.id,
    ]);
    expect(blocked.rowCount).toBeGreaterThan(0);
  });

  it('RN-010-08: abrir un reclamo no banea a nadie por sí solo', async () => {
    await dispute('expirada_sin_respuesta');
    expect((await harness.pool.query('SELECT 1 FROM bans')).rowCount).toBe(0);
    expect(await statusOf(group.ownerId)).toBe('activo');
  });

  it('RF-010-24: resolver dos veces es 409 INVALID_TRANSITION; un motivo corto o un resultado inválido, 400', async () => {
    const { id } = await dispute('rechazada');
    await resolve(admin, id, { result: 'sin_falta', reason: 'corto' }).expect(400);
    await resolve(admin, id, { result: 'otra', reason: REASON }).expect(400);
    await resolve(admin, id, { reason: REASON }).expect(400);
    await resolve(admin, id, { result: 'sin_falta', reason: 'x'.repeat(301) }).expect(400);
    await resolve(admin, id, { result: 'sin_falta', reason: REASON }).expect(200);
    const again = await resolve(admin, id, { result: 'estafa_confirmada', reason: REASON }).expect(
      409,
    );
    expect(again.body.code).toBe('INVALID_TRANSITION');
    expect((await harness.pool.query('SELECT 1 FROM bans')).rowCount).toBe(0);
  });

  it('RNF-010-08: si el baneo falla, el reclamo sigue abierto y no queda auditoría (misma transacción)', async () => {
    const { id } = await dispute('expirada_sin_respuesta');
    // Un administrador no puede ser baneado por esta vía: la transacción completa se revierte.
    await harness.pool.query(`UPDATE users SET role = 'admin' WHERE id = $1`, [group.ownerId]);
    const failed = await resolve(admin, id, { result: 'estafa_confirmada', reason: REASON });
    expect(failed.status).toBeGreaterThanOrEqual(400);
    const row = await harness.pool.query<{ status: string }>(
      'SELECT status FROM join_disputes WHERE id = $1',
      [id],
    );
    expect(row.rows[0]?.status).toBe('abierto');
    expect(await audit(id)).toEqual([]);
    expect(await statusOf(group.ownerId)).toBe('activo');
  });

  it('RNF-010-02: los logs no llevan motivos, referencias ni URLs firmadas al abrir y resolver', async () => {
    const lines: string[] = [];
    for (const level of ['log', 'warn', 'error', 'debug', 'verbose'] as const) {
      jest.spyOn(Logger.prototype, level).mockImplementation((...args: unknown[]) => {
        lines.push(args.map(String).join(' '));
      });
    }
    const { id } = await dispute('rechazada');
    harness.storage.failSignedUrl = true;
    await evidence(admin, id).expect(200);
    await resolve(admin, id, { result: 'sin_falta', reason: REASON }).expect(200);
    const text = lines.join('\n');
    expect(text).not.toContain(REASON);
    expect(text).not.toContain('REF-1');
    expect(text).not.toContain('Descripción del reclamo');
    expect(text).not.toMatch(/dispute-[0-9a-f-]{36}/);
  });
});
