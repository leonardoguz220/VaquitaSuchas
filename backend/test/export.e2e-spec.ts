import request from 'supertest';
import { BillingHarness } from './support/billing-harness.js';
import { ReportsFixtures } from './support/reports-fixtures.js';
import { ReportsModule } from '../src/modules/reports/reports.module.js';

// Historial y exportación a CSV (spec 006, US5, T024/T025). Hoy es 2026-10-16 (La Paz).
describe('Historial y exportación', () => {
  const harness = new BillingHarness({ imports: [ReportsModule] });
  const fixtures = new ReportsFixtures(harness);

  const get = (userId: string, url: string): request.Test =>
    request(harness.app.getHttpServer())
      .get(url)
      .set('Authorization', `Bearer ${harness.token(userId)}`);

  /** Descarga el CSV como bytes: así se ve el BOM, que un decodificador de texto descartaría. */
  const download = (userId: string, url: string): request.Test =>
    get(userId, url)
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      });

  beforeAll(async () => {
    await harness.start();
  }, 60_000);

  afterAll(async () => {
    await harness.stop();
  }, 30_000);

  it('CA-006-15: el CSV lleva BOM, acentos intactos y montos numéricos con punto', async () => {
    const owner = await harness.insertUser('Titular Suchas');
    const member = await harness.insertUser('José Ñandú');
    const group = await fixtures.createGroup({
      ownerId: owner,
      memberIds: [member],
      name: 'Café',
      serviceName: 'Música',
    });
    await fixtures.charge(group, member, { amountCents: 2550, status: 'pagado' });

    const response = await download(owner, `/groups/${group.id}/history/export.csv`).expect(200);

    expect(response.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(response.headers['content-disposition']).toMatch(
      /^attachment; filename="vaquita-historial-grupo-2026-10-16\.csv"$/,
    );
    const bytes = response.body as Buffer;
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const lines = bytes
      .toString('utf8')
      .replace(/^\uFEFF/, '')
      .trim()
      .split('\r\n');
    expect(lines[0]).toBe(
      'periodo,servicio,grupo,miembro,monto_bs,estado,vencimiento,fecha_pago,origen',
    );
    expect(lines[1]).toMatch(
      /^2026-10,Música,Café,José Ñandú,25\.50,pagado,2026-10-\d\d,2026-10-\d\d,ciclo$/,
    );
  });

  it('CA-006-16: un nombre =CMD() sale como texto, no como fórmula', async () => {
    const owner = await harness.insertUser();
    const member = await harness.insertUser('=CMD()');
    const group = await fixtures.createGroup({ ownerId: owner, memberIds: [member] });
    await fixtures.charge(group, member, { amountCents: 1000 });

    const response = await download(owner, `/groups/${group.id}/history/export.csv`).expect(200);

    const text = (response.body as Buffer).toString('utf8');
    expect(text).toContain("'=CMD()");
    expect(text).not.toMatch(/(^|,)=CMD\(\)/m);
  });

  it('CA-006-17: el miembro no exporta el grupo (403) y quien no es del grupo recibe 404', async () => {
    const owner = await harness.insertUser();
    const member = await harness.insertUser();
    const stranger = await harness.insertUser();
    const group = await fixtures.createGroup({ ownerId: owner, memberIds: [member] });

    await get(member, `/groups/${group.id}/history/export.csv`).expect(403);
    await get(stranger, `/groups/${group.id}/history/export.csv`).expect(404);
  });

  it('el historial propio exportado incluye cancelados, de grupos que dejó, y nada ajeno', async () => {
    const owner = await harness.insertUser();
    const member = await harness.insertUser();
    const other = await harness.insertUser();
    const group = await fixtures.createGroup({ ownerId: owner, memberIds: [member, other] });
    await fixtures.charge(group, member, {
      period: '2026-09',
      amountCents: 1000,
      status: 'cancelado',
    });
    await fixtures.charge(group, other, { period: '2026-09', amountCents: 1000 });
    await harness.leaveGroup(group.id, member);

    const response = await download(member, '/me/history/export.csv').expect(200);

    const lines = (response.body as Buffer).toString('utf8').trim().split('\r\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('periodo,servicio,grupo,monto_bs');
    expect(lines[0]).not.toContain('miembro');
    expect(lines[1]).toContain('cancelado');
    expect(lines.join('')).not.toMatch(/comprobante|receipt|referencia|phone|\+591/i);
  });

  it('GET /me/history: pagina por cursor y filtra por mes, suscripción y estado', async () => {
    const owner = await harness.insertUser();
    const member = await harness.insertUser();
    const first = await fixtures.createGroup({ ownerId: owner, memberIds: [member] });
    const second = await fixtures.createGroup({ ownerId: owner, memberIds: [member] });
    for (const period of ['2026-07', '2026-08', '2026-09']) {
      await fixtures.charge(first, member, { period, amountCents: 1000 });
    }
    await fixtures.charge(second, member, {
      period: '2026-09',
      amountCents: 1000,
      status: 'pagado',
    });

    const page1 = await get(member, '/me/history?limit=2').expect(200);
    expect(page1.body.items.map((i: { period: string }) => i.period)).toEqual([
      '2026-09',
      '2026-09',
    ]);
    const page2 = await get(
      member,
      `/me/history?limit=2&cursor=${page1.body.nextCursor as string}`,
    ).expect(200);
    expect(page2.body.items).toHaveLength(2);
    expect(page2.body.nextCursor).toBeNull();
    const ids = [...page1.body.items, ...page2.body.items].map(
      (i: { chargeId: string }) => i.chargeId,
    );
    expect(new Set(ids).size).toBe(4);

    expect((await get(member, '/me/history?period=2026-08').expect(200)).body.items).toHaveLength(
      1,
    );
    expect(
      (await get(member, `/me/history?groupId=${second.id}`).expect(200)).body.items,
    ).toHaveLength(1);
    const paid = await get(member, '/me/history?status=pagado,cancelado').expect(200);
    expect(paid.body.items).toHaveLength(1);
    expect(paid.body.items[0]).toMatchObject({
      status: 'pagado',
      origin: 'ciclo',
      paidAt: expect.any(String),
    });
    await get(member, '/me/history?status=inventado').expect(400);
    await get(member, '/me/history?cursor=basura').expect(400);
  });

  it('RNF-006-04: la 11.ª exportación en una hora responde 429 con el tiempo de espera', async () => {
    const user = await harness.insertUser();
    for (let i = 0; i < 10; i++) await download(user, '/me/history/export.csv').expect(200);

    const blocked = await get(user, '/me/history/export.csv').expect(429);
    expect(blocked.body.error?.details ?? blocked.body.details).toMatchObject({
      retryAfterSeconds: expect.any(Number),
    });

    // El reloj de la prueba no retrocede: este es el último caso del archivo.
    harness.clock.advance(61 * 60 * 1000);
    await download(user, '/me/history/export.csv').expect(200);
  });
});
