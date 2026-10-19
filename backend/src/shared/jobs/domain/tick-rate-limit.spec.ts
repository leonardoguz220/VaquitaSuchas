import { TICK_MIN_INTERVAL_MS, decideTickRate } from './tick-rate-limit.js';

const T0 = new Date('2026-10-18T12:00:00.000Z');
const after = (ms: number): Date => new Date(T0.getTime() + ms);

describe('decideTickRate (RF-000-14)', () => {
  it('RF-000-14: la primera llamada siempre se acepta', () => {
    expect(decideTickRate(null, T0)).toEqual({ allowed: true });
  });

  it('RF-000-14: la ventana por omisión es de 1 segundo', () => {
    expect(TICK_MIN_INTERVAL_MS).toBe(1000);
  });

  it.each([
    [0, 1],
    [1, 1],
    [400, 1],
    [999, 1],
  ])('RF-000-14: a %i ms de la anterior se rechaza con retryAfterSeconds %i', (ms, retry) => {
    expect(decideTickRate(T0, after(ms))).toEqual({ allowed: false, retryAfterSeconds: retry });
  });

  it.each([1000, 1001, 60_000])('RF-000-14: a %i ms de la anterior se acepta', (ms) => {
    expect(decideTickRate(T0, after(ms))).toEqual({ allowed: true });
  });

  it('RF-000-14: redondea hacia arriba el tiempo que falta en una ventana mayor', () => {
    expect(decideTickRate(T0, after(500), 3000)).toEqual({
      allowed: false,
      retryAfterSeconds: 3,
    });
    expect(decideTickRate(T0, after(2000), 3000)).toEqual({
      allowed: false,
      retryAfterSeconds: 1,
    });
  });

  it('RF-000-14: si el reloj retrocede acepta en vez de bloquear más de una ventana', () => {
    expect(decideTickRate(T0, after(-5000))).toEqual({ allowed: true });
  });
});
