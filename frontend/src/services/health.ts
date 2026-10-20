/**
 * Cliente de `GET /health` (contrato 000 B, RF-000-09 y RF-000-18). Los tipos copian
 * `backend/src/modules/health/controllers/health-response.dto.ts`.
 */
import { apiRequest } from './http';

/** `degraded` cuando la base no respondió a tiempo; el backend sigue en pie. */
export type BackendHealthStatus = 'ok' | 'degraded';

export type DatabaseHealthStatus = 'up' | 'down';

export interface DatabaseHealth {
  status: DatabaseHealthStatus;
  /** Milisegundos que tardó `SELECT 1`; `null` si la base no respondió. */
  latencyMs: number | null;
}

export interface HealthResponse {
  status: BackendHealthStatus;
  version: string;
  /** Segundos desde el arranque del proceso. */
  uptimeSeconds: number;
  database: DatabaseHealth;
  /** Hora del servidor, ISO 8601 en UTC. */
  time: string;
}

export interface GetHealthOptions {
  signal?: AbortSignal;
}

/** `GET /health` a través del proxy (`/api/health`). Pública: no necesita sesión. */
export function getHealth(options: GetHealthOptions = {}): Promise<HealthResponse> {
  return apiRequest<HealthResponse>('/api/health', { signal: options.signal });
}
