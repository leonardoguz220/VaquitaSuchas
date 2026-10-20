// Reglas puras de /health (RF-000-09): sin NestJS, sin pg y sin leer el reloj.

/** Versión que publica /health. Debe coincidir con el ejemplo del contrato (api.md, parte B). */
export const APP_VERSION = '0.1.0';

/** Tiempo máximo que se espera a la base antes de declararla caída (plan.md §5). */
export const HEALTH_DB_TIMEOUT_MS = 2000;

export type DatabaseState = 'up' | 'down';
export type OverallStatus = 'ok' | 'degraded';

export interface HealthReport {
  status: OverallStatus;
  version: string;
  uptimeSeconds: number;
  database: { status: DatabaseState; latencyMs: number | null };
  time: string;
}

export interface HealthReportInput {
  version: string;
  uptimeSeconds: number;
  databaseUp: boolean;
  /** Tiempo medido de la consulta; se descarta si la base está caída. */
  latencyMs: number;
  now: Date;
}

export function deriveOverallStatus(database: DatabaseState): OverallStatus {
  return database === 'up' ? 'ok' : 'degraded';
}

/** Segundos enteros entre dos instantes; nunca negativo si el reloj retrocede. */
export function elapsedSeconds(from: Date, to: Date): number {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 1000));
}

export function buildHealthReport(input: HealthReportInput): HealthReport {
  const databaseState: DatabaseState = input.databaseUp ? 'up' : 'down';
  return {
    status: deriveOverallStatus(databaseState),
    version: input.version,
    uptimeSeconds: input.uptimeSeconds,
    // Con la base caída no hay latencia que informar: solo el estado, nunca el motivo.
    database: {
      status: databaseState,
      latencyMs: input.databaseUp ? Math.max(0, Math.round(input.latencyMs)) : null,
    },
    time: input.now.toISOString(),
  };
}
