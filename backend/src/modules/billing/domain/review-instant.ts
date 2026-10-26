/**
 * Instante con el que el titular revisa un cobro (confirmar, rechazar, pago manual).
 *
 * En producción es siempre `now`. En development y test, el tick con `?now=` puede emitir un cobro
 * con `issued_at` futuro; revisarlo con la hora real violaría `charges_paid_at_check`
 * (`paid_at >= issued_at`), así que ahí se sube a `issuedAt`. Es un ajuste hacia adelante, nunca
 * hacia atrás, y no cambia nada si el cobro ya fue emitido.
 */
export function resolveReviewInstant(input: {
  now: Date;
  issuedAt: Date;
  simulationAllowed: boolean;
}): Date {
  if (!input.simulationAllowed || input.now.getTime() >= input.issuedAt.getTime()) return input.now;
  return new Date(input.issuedAt.getTime());
}

/** Mismo criterio que `?now=` del tick: falla cerrado, solo development y test. */
export function isSimulationAllowed(nodeEnv: unknown): boolean {
  return nodeEnv === 'development' || nodeEnv === 'test';
}
