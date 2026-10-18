import { cleanupCutoffs } from './maintenance-cleanup.js';

describe('cleanupCutoffs', () => {
  const now = new Date('2026-06-15T12:00:00.000Z');

  it('RF-000-14: job_runs se conserva 30 días', () => {
    expect(cleanupCutoffs(now).jobRunsBefore.toISOString()).toBe('2026-05-16T12:00:00.000Z');
  });

  it('RF-000-14: rate_limit_events se conserva 24 horas', () => {
    expect(cleanupCutoffs(now).rateLimitEventsBefore.toISOString()).toBe(
      '2026-06-14T12:00:00.000Z',
    );
  });

  it('RF-000-14: telegram_updates se conserva 7 días', () => {
    expect(cleanupCutoffs(now).telegramUpdatesBefore.toISOString()).toBe(
      '2026-06-08T12:00:00.000Z',
    );
  });

  it('RF-000-14: no modifica la fecha recibida', () => {
    const input = new Date(now);

    cleanupCutoffs(input);

    expect(input.toISOString()).toBe(now.toISOString());
  });
});
