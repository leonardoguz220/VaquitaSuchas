const RETENTION_MONTHS = 2;

/**
 * Límite de la retención de solicitudes (RNF-010-09): un estado final o reclamo resuelto antes de este instante ya
 * cumplió 2 meses. Resta meses en UTC y ajusta el día al último del mes si no existe (31 de
 * abril no existe).
 */
export function retentionCutoff(now: Date): Date {
  const target = new Date(now.getTime());
  target.setUTCDate(1);
  target.setUTCMonth(target.getUTCMonth() - RETENTION_MONTHS);
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(now.getUTCDate(), lastDay));
  return target;
}
