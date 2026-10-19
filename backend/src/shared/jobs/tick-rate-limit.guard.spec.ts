import { FakeClock } from '../clock/fake-clock.js';
import { DomainError } from '../errors/domain-error.js';
import { TickRateLimitGuard } from './tick-rate-limit.guard.js';

const NOW = '2026-10-18T12:00:00.000Z';

function rejection(fn: () => unknown): DomainError {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(DomainError);
    return error as DomainError;
  }
  throw new Error('Se esperaba que el guard rechazara la llamada.');
}

describe('TickRateLimitGuard (RF-000-14)', () => {
  it('RF-000-14: la primera llamada pasa', () => {
    const guard = new TickRateLimitGuard(new FakeClock(NOW));

    expect(guard.canActivate()).toBe(true);
  });

  it('RF-000-14: la segunda llamada dentro del mismo segundo responde 429 RATE_LIMITED con retryAfterSeconds', () => {
    const clock = new FakeClock(NOW);
    const guard = new TickRateLimitGuard(clock);
    guard.canActivate();
    clock.advance(300);

    const error = rejection(() => guard.canActivate());

    expect(error.httpStatus).toBe(429);
    expect(error.code).toBe('RATE_LIMITED');
    expect(error.details).toEqual({ retryAfterSeconds: 1 });
  });

  it('RF-000-14: pasado el segundo vuelve a aceptar', () => {
    const clock = new FakeClock(NOW);
    const guard = new TickRateLimitGuard(clock);
    guard.canActivate();
    clock.advance(1000);

    expect(guard.canActivate()).toBe(true);
  });

  it('RF-000-14: las llamadas rechazadas no extienden la ventana', () => {
    const clock = new FakeClock(NOW);
    const guard = new TickRateLimitGuard(clock);
    guard.canActivate();
    clock.advance(600);
    rejection(() => guard.canActivate());
    clock.advance(400);

    // 1000 ms desde la última ACEPTADA, aunque solo pasaron 400 desde el rechazo.
    expect(guard.canActivate()).toBe(true);
  });

  it('RF-000-14: el mensaje del 429 no incluye datos internos', () => {
    const clock = new FakeClock(NOW);
    const guard = new TickRateLimitGuard(clock);
    guard.canActivate();

    const error = rejection(() => guard.canActivate());

    expect(error.message).toBe(
      'Demasiadas llamadas al disparador de tareas. Intenta de nuevo en un momento.',
    );
  });
});
