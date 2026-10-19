// Retención de datos operativos (RF-000-14, data-model.md §3): umbrales de `maintenance.cleanup`.

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export const JOB_RUNS_RETENTION_MS = 30 * DAY_MS;
export const RATE_LIMIT_EVENTS_RETENTION_MS = 24 * HOUR_MS;
export const TELEGRAM_UPDATES_RETENTION_MS = 7 * DAY_MS;

export interface CleanupCutoffs {
  /** Se borran las filas con `job_runs.started_at` anterior a este instante. */
  readonly jobRunsBefore: Date;
  /** Se borran las filas con `rate_limit_events.occurred_at` anterior a este instante. */
  readonly rateLimitEventsBefore: Date;
  /** Se borran las filas con `telegram_updates.received_at` anterior a este instante. */
  readonly telegramUpdatesBefore: Date;
}

/** Instantes de corte a partir de `now` (UTC). Lo que es exactamente igual al corte se conserva. */
export function cleanupCutoffs(now: Date): CleanupCutoffs {
  const nowMs = now.getTime();
  return {
    jobRunsBefore: new Date(nowMs - JOB_RUNS_RETENTION_MS),
    rateLimitEventsBefore: new Date(nowMs - RATE_LIMIT_EVENTS_RETENTION_MS),
    telegramUpdatesBefore: new Date(nowMs - TELEGRAM_UPDATES_RETENTION_MS),
  };
}
