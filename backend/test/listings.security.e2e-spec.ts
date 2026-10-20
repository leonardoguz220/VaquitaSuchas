import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import { JobRunner } from '../src/shared/jobs/job-runner.js';
import { ListingsModule } from '../src/modules/listings/listings.module.js';
import { BillingHarness, NOW } from './support/billing-harness.js';
import { seedListing } from './support/listings-fixtures.js';
import { setClock } from './support/join-requests-fixtures.js';

const MODULE_DIR = join(process.cwd(), 'src', 'modules', 'listings');
const sources = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return path.endsWith('.ts') && !path.endsWith('.spec.ts') ? [path] : [];
  });

// Revisión de seguridad de la spec 008 (T026): lo que no cubren las demás pruebas.
describe('Seguridad de cupos libres (spec 008)', () => {
  const harness = new BillingHarness({ imports: [ListingsModule] });
  const send = (method: 'post' | 'get', userId: string, url: string, body?: object) => {
    const call = request(harness.app.getHttpServer())
      [method](url)
      .set('Authorization', `Bearer ${harness.token(userId)}`);
    return body ? call.send(body) : call;
  };

  beforeAll(() => harness.start(), 60_000);
  afterAll(() => harness.stop(), 30_000);
  beforeEach(() => setClock(harness, NOW));

  it('RNF-008-01: cuota, plazos, estado y versión los fija el servidor aunque el cuerpo los traiga', async () => {
    const group = await harness.createGroup({ members: 2 });

    const response = await send('post', group.ownerId, `/groups/${group.id}/listing`, {
      slotsOffered: 1,
      status: 'cerrada',
      expiresAt: '2099-01-01T00:00:00.000Z',
      publishedAt: '2000-01-01T00:00:00.000Z',
      version: 99,
      estimatedShareCents: 1,
      reportCount: 5,
    });

    // O se rechaza el campo ajeno o se ignora: nunca se obedece.
    if (response.status === 201) {
      expect(response.body).toMatchObject({
        status: 'activa',
        version: 1,
        reportCount: 0,
        publishedAt: NOW,
        expiresAt: new Date(Date.parse(NOW) + 30 * 86_400_000).toISOString(),
      });
    } else {
      expect(response.status).toBe(400);
    }
  });

  it('RNF-008-06: el titular ve cuántos reportes tiene, nunca quién los hizo ni su comentario', async () => {
    const seeded = await seedListing(harness, { extraMembers: 1 });
    const reporterA = await harness.insertUser('Reportera Secreta');
    const reporterB = await harness.insertUser();
    await send('post', reporterA, `/listings/${seeded.listingId}/reports`, {
      reason: 'spam',
      comment: 'comentario-privado-xyz',
    }).expect(204);
    await send('post', reporterB, `/listings/${seeded.listingId}/reports`, {
      reason: 'otro',
    }).expect(204);

    const owner = await send('get', seeded.ownerId, `/groups/${seeded.groupId}/listing`).expect(
      200,
    );

    expect(owner.body.reportCount).toBe(2);
    const text = JSON.stringify(owner.body);
    for (const secret of [reporterA, reporterB, 'Reportera Secreta', 'comentario-privado-xyz']) {
      expect(text).not.toContain(secret);
    }
    const member = await send(
      'get',
      seeded.memberIds[0] as string,
      `/groups/${seeded.groupId}/listing`,
    );
    expect(JSON.stringify(member.body)).not.toContain('reportCount');
  });

  it('RNF-008-03: tres reportes simultáneos de personas distintas ocultan una sola vez y avisan una sola vez', async () => {
    const seeded = await seedListing(harness);
    const reporters = [
      await harness.insertUser(),
      await harness.insertUser(),
      await harness.insertUser(),
    ];

    const responses = await Promise.all(
      reporters.map((userId) =>
        send('post', userId, `/listings/${seeded.listingId}/reports`, { reason: 'spam' }),
      ),
    );

    expect(responses.map((r) => r.status)).toEqual([204, 204, 204]);
    const state = await harness.pool.query<{ status: string; version: number }>(
      'SELECT status, version FROM listings WHERE id = $1',
      [seeded.listingId],
    );
    expect(state.rows[0]?.status).toBe('oculta');
    const notices = await harness.pool.query(
      `SELECT 1 FROM notifications WHERE type = 'publicacion_oculta' AND user_id = $1`,
      [seeded.ownerId],
    );
    expect(notices.rowCount).toBe(1);
  });

  it('RNF-008-03: un reporte y la tarea listings.expire a la vez terminan sin bloqueo mutuo', async () => {
    const seeded = await seedListing(harness, { extraMembers: 1 });
    setClock(harness, '2026-11-10T12:00:00.000Z');
    const reporter = await harness.insertUser();
    const runner = harness.app.get(JobRunner, { strict: false });

    const [report, [job]] = await Promise.all([
      send('post', reporter, `/listings/${seeded.listingId}/reports`, { reason: 'spam' }),
      runner.runAll('manual', { job: 'listings.expire' }),
    ]);

    expect([204, 404]).toContain(report.status);
    expect(job).toMatchObject({ status: 'ok' });
    const state = await harness.pool.query<{ status: string }>(
      'SELECT status FROM listings WHERE id = $1',
      [seeded.listingId],
    );
    expect(state.rows[0]?.status).toBe('expirada');
  });

  it('RNF-008-01: el módulo no deja console.* y sus registros no llevan datos personales', () => {
    for (const file of sources(MODULE_DIR)) {
      const code = readFileSync(file, 'utf8');
      expect(code).not.toMatch(/console\./);
      const logLines = code
        .split('\n')
        .filter((line) => /logger\.(log|warn|error|debug)/.test(line));
      for (const line of logLines) {
        expect(line).not.toMatch(
          /email|phone|telefono|celular|fullName|full_name|\bci\b|comment|message/i,
        );
      }
    }
  });
});
