import {
  buildHealthReport,
  deriveOverallStatus,
  elapsedSeconds,
  HEALTH_DB_TIMEOUT_MS,
} from './health.js';

describe('dominio de health', () => {
  it('RF-000-09: el tiempo máximo de la consulta a la base es de 2 segundos', () => {
    expect(HEALTH_DB_TIMEOUT_MS).toBe(2000);
  });

  it('RF-000-09: el estado global es ok solo si la base responde', () => {
    expect(deriveOverallStatus('up')).toBe('ok');
    expect(deriveOverallStatus('down')).toBe('degraded');
  });

  it.each([
    [0, 0],
    [999, 0],
    [1000, 1],
    [61_500, 61],
  ])('RF-000-09: %i ms de actividad son %i segundos enteros', (ms, expected) => {
    const startedAt = new Date('2026-10-18T10:00:00.000Z');
    const now = new Date(startedAt.getTime() + ms);

    expect(elapsedSeconds(startedAt, now)).toBe(expected);
  });

  it('RF-000-09: la actividad nunca es negativa aunque el reloj retroceda', () => {
    const startedAt = new Date('2026-10-18T10:00:00.000Z');

    expect(elapsedSeconds(startedAt, new Date(startedAt.getTime() - 5000))).toBe(0);
  });

  it('CA-000-06: arma el informe con base arriba, hora en ISO UTC y las claves del contrato', () => {
    const report = buildHealthReport({
      version: '0.1.0',
      uptimeSeconds: 1234,
      databaseUp: true,
      latencyMs: 4,
      now: new Date('2026-10-18T17:00:00.000Z'),
    });

    expect(report).toEqual({
      status: 'ok',
      version: '0.1.0',
      uptimeSeconds: 1234,
      database: { status: 'up', latencyMs: 4 },
      time: '2026-10-18T17:00:00.000Z',
    });
  });

  it('CA-000-06: con la base caída el informe es degraded y no lleva latencia', () => {
    const report = buildHealthReport({
      version: '0.1.0',
      uptimeSeconds: 10,
      databaseUp: false,
      latencyMs: 1999,
      now: new Date('2026-10-18T17:00:00.000Z'),
    });

    expect(report.status).toBe('degraded');
    expect(report.database).toEqual({ status: 'down', latencyMs: null });
  });
});
