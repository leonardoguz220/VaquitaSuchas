import { isSimulationAllowed, resolveReviewInstant } from './review-instant.js';

describe('resolveReviewInstant', () => {
  const now = new Date('2026-10-16T15:00:00Z');
  const future = new Date('2026-11-15T12:00:00Z');
  const past = new Date('2026-10-15T04:00:00Z');

  it('en producción devuelve siempre now, aunque el cobro sea futuro', () => {
    expect(resolveReviewInstant({ now, issuedAt: future, simulationAllowed: false })).toEqual(now);
  });

  it('fuera de producción sube a issuedAt si el cobro nació en una fecha simulada futura', () => {
    expect(resolveReviewInstant({ now, issuedAt: future, simulationAllowed: true })).toEqual(
      future,
    );
  });

  it('si el cobro ya fue emitido no cambia nada', () => {
    expect(resolveReviewInstant({ now, issuedAt: past, simulationAllowed: true })).toEqual(now);
    expect(resolveReviewInstant({ now, issuedAt: now, simulationAllowed: true })).toEqual(now);
  });
});

describe('isSimulationAllowed', () => {
  it('solo development y test; cualquier otro valor falla cerrado', () => {
    expect(isSimulationAllowed('development')).toBe(true);
    expect(isSimulationAllowed('test')).toBe(true);
    expect(isSimulationAllowed('production')).toBe(false);
    expect(isSimulationAllowed(undefined)).toBe(false);
    expect(isSimulationAllowed('staging')).toBe(false);
  });
});
