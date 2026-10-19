import { jest } from '@jest/globals';
import { FakeClock } from '../../../shared/clock/fake-clock.js';
import type { HealthRepository } from '../repositories/health.repository.js';
import { HealthService } from './health.service.js';

const START = '2026-10-18T17:00:00.000Z';
const PG_MESSAGE =
  'connect ECONNREFUSED 10.1.2.3:5432 password authentication failed for user "secreto_user"';

type Ping = () => Promise<void>;

function setup(ping: Ping) {
  const clock = new FakeClock(START);
  const repository = { ping: jest.fn<Ping>(ping) };
  const service = new HealthService(repository as unknown as HealthRepository, clock);
  return { clock, repository, service };
}

describe('HealthService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('CA-000-06: con la base arriba responde ok con la latencia medida con el Clock', async () => {
    const { clock, service } = setup(() => {
      clock.advance(4);
      return Promise.resolve();
    });

    const report = await service.check();

    expect(report).toEqual({
      status: 'ok',
      version: '0.1.0',
      uptimeSeconds: 0,
      database: { status: 'up', latencyMs: 4 },
      time: '2026-10-18T17:00:00.004Z',
    });
  });

  it('RF-000-09: uptimeSeconds cuenta los segundos desde que se creó el servicio', async () => {
    const { clock, service } = setup(() => Promise.resolve());

    clock.advance(90_500);
    const report = await service.check();

    expect(report.uptimeSeconds).toBe(90);
    expect(report.time).toBe('2026-10-18T17:01:30.500Z');
  });

  it('RF-000-09: si la base rechaza, responde degraded/down sin latencia y sin filtrar el mensaje', async () => {
    const { service } = setup(() =>
      Promise.reject(Object.assign(new Error(PG_MESSAGE), { code: 'ECONNREFUSED' })),
    );

    const report = await service.check();

    expect(report.status).toBe('degraded');
    expect(report.database).toEqual({ status: 'down', latencyMs: null });
    const text = JSON.stringify(report);
    for (const leaked of ['ECONNREFUSED', '10.1.2.3', 'secreto_user', 'password', 'connect ']) {
      expect(text).not.toContain(leaked);
    }
    expect(Object.keys(report).sort()).toEqual([
      'database',
      'status',
      'time',
      'uptimeSeconds',
      'version',
    ]);
  });

  it('RF-000-09: el servicio nunca rechaza, ni siquiera si el repositorio lanza de forma síncrona', async () => {
    const { repository, service } = setup(() => Promise.resolve());
    repository.ping.mockImplementation(() => {
      throw new Error(PG_MESSAGE);
    });

    await expect(service.check()).resolves.toMatchObject({
      status: 'degraded',
      database: { status: 'down' },
    });
  });

  it('RF-000-09: un valor lanzado que no es Error también se traduce a down', async () => {
    const { service } = setup(() => Promise.reject('texto suelto con la clave'));

    const report = await service.check();

    expect(report.database.status).toBe('down');
    expect(JSON.stringify(report)).not.toContain('clave');
  });

  it('RF-000-09: si la base tarda más de 2 s responde degraded/down sin esperar tiempo real', async () => {
    const { service } = setup(() => new Promise<void>(() => undefined));

    const pending = service.check();
    await jest.advanceTimersByTimeAsync(1999);
    let settled = false;
    void pending.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    await jest.advanceTimersByTimeAsync(1);
    const report = await pending;

    expect(report.status).toBe('degraded');
    expect(report.database).toEqual({ status: 'down', latencyMs: null });
  });

  it('RF-000-09: una respuesta justo antes de los 2 s cuenta como arriba', async () => {
    let finish: () => void = () => undefined;
    const { service } = setup(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );

    const pending = service.check();
    await jest.advanceTimersByTimeAsync(1999);
    finish();
    const report = await pending;

    expect(report.database.status).toBe('up');
  });

  it('RF-000-09: el temporizador se limpia siempre (éxito, error y tiempo agotado)', async () => {
    const ok = setup(() => Promise.resolve());
    await ok.service.check();
    expect(jest.getTimerCount()).toBe(0);

    const failing = setup(() => Promise.reject(new Error(PG_MESSAGE)));
    await failing.service.check();
    expect(jest.getTimerCount()).toBe(0);

    const slow = setup(() => new Promise<void>(() => undefined));
    const pending = slow.service.check();
    expect(jest.getTimerCount()).toBe(1);
    await jest.advanceTimersByTimeAsync(2000);
    await pending;
    expect(jest.getTimerCount()).toBe(0);
  });

  it('RF-000-09: si la consulta rechaza tarde, después del tiempo agotado, no hay rechazo sin manejar', async () => {
    let fail: (error: Error) => void = () => undefined;
    const { service } = setup(
      () =>
        new Promise<void>((_resolve, reject) => {
          fail = reject;
        }),
    );
    const unhandled = jest.fn();
    process.on('unhandledRejection', unhandled);

    try {
      const pending = service.check();
      await jest.advanceTimersByTimeAsync(2000);
      await pending;
      fail(new Error(PG_MESSAGE));
      await jest.advanceTimersByTimeAsync(10);
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });
});
