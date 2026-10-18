import { Injectable } from '@nestjs/common';
import { Clock } from '../../../shared/clock/clock.js';
import {
  APP_VERSION,
  buildHealthReport,
  elapsedSeconds,
  HEALTH_DB_TIMEOUT_MS,
  type HealthReport,
} from '../domain/health.js';
import { HealthRepository } from '../repositories/health.repository.js';

@Injectable()
export class HealthService {
  // El Clock inyectado marca el arranque: así `uptimeSeconds` es determinista en las pruebas.
  private readonly startedAt: Date;

  constructor(
    private readonly repository: HealthRepository,
    private readonly clock: Clock,
  ) {
    this.startedAt = clock.now();
  }

  /**
   * Estado del servicio y de la base (RF-000-09). Nunca rechaza: cualquier fallo de la base se
   * traduce a `database.status = 'down'` y el motivo (mensaje, código, host) se descarta a
   * propósito, porque esta ruta es pública y no debe revelar nada de la infraestructura.
   */
  async check(): Promise<HealthReport> {
    const measureStart = this.clock.now();
    const databaseUp = await this.pingDatabase();
    const now = this.clock.now();

    return buildHealthReport({
      version: APP_VERSION,
      uptimeSeconds: elapsedSeconds(this.startedAt, now),
      databaseUp,
      latencyMs: now.getTime() - measureStart.getTime(),
      now,
    });
  }

  /** `true` si `SELECT 1` responde antes del tiempo máximo; `false` si falla o se agota. */
  private async pingDatabase(): Promise<boolean> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<false>((resolve) => {
      timer = setTimeout(() => resolve(false), HEALTH_DB_TIMEOUT_MS);
    });
    // `Promise.resolve().then` convierte también un lanzamiento síncrono en rechazo, y manejar
    // el rechazo aquí evita uno sin atender si la consulta falla después de agotado el tiempo.
    const ping = Promise.resolve()
      .then(() => this.repository.ping())
      .then(
        () => true as const,
        () => false as const,
      );

    try {
      return await Promise.race([ping, timedOut]);
    } finally {
      // Siempre se limpia: un temporizador colgado impediría cerrar el proceso y Jest.
      clearTimeout(timer);
    }
  }
}
