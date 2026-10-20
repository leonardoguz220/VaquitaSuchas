import { MAX_ATTEMPTS, nextRetry } from './retry.js';

describe('nextRetry', () => {
  const now = new Date('2026-10-20T15:00:00Z');

  it('RF-005-20: reintenta a los 5 minutos, 30 minutos y 2 horas', () => {
    const at = (attempts: number) => nextRetry(attempts, now);
    expect(at(1)).toEqual({ status: 'pending', nextAttemptAt: new Date('2026-10-20T15:05:00Z') });
    expect(at(2)).toEqual({ status: 'pending', nextAttemptAt: new Date('2026-10-20T15:30:00Z') });
    expect(at(3)).toEqual({ status: 'pending', nextAttemptAt: new Date('2026-10-20T17:00:00Z') });
  });

  it('CA-005-20: agotados los reintentos queda failed (4 intentos, el máximo de la base)', () => {
    expect(nextRetry(4, now)).toEqual({ status: 'failed' });
    expect(MAX_ATTEMPTS).toBe(4);
  });

  it('rechaza intentos inválidos', () => {
    expect(() => nextRetry(0, now)).toThrow();
    expect(() => nextRetry(1.5, now)).toThrow();
  });
});
