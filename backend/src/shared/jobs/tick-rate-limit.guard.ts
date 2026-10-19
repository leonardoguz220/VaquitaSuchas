import { Injectable } from '@nestjs/common';
import type { CanActivate } from '@nestjs/common';
import { Clock } from '../clock/clock.js';
import { DomainError } from '../errors/domain-error.js';
import { ErrorCode } from '../errors/error-codes.js';
import { decideTickRate } from './domain/tick-rate-limit.js';

/**
 * Límite de 1 llamada por segundo de `POST /internal/jobs/tick` (RF-000-14, plan §7).
 *
 * Va SIEMPRE después de `JobsTokenGuard` en `@UseGuards(...)`: así una llamada sin token válido
 * se rechaza con 401 antes de llegar aquí y no puede gastar el cupo del cron legítimo.
 *
 * El estado está en memoria del proceso (un solo servicio en el MVP) y no en `rate_limit_events`:
 * esa tabla es de solo anexado y no se puede limpiar hasta T033, y escribir una fila por cada
 * tick llenaría la base para algo que no necesita persistir. Si el backend pasa a varias
 * instancias, cada una admitiría 1 llamada por segundo y el bloqueo asesor de `JobRunner` sigue
 * evitando que una tarea corra dos veces a la vez. El instante sale del `Clock` inyectado.
 */
@Injectable()
export class TickRateLimitGuard implements CanActivate {
  private lastAllowedAt: Date | null = null;

  constructor(private readonly clock: Clock) {}

  canActivate(): boolean {
    const now = this.clock.now();
    const decision = decideTickRate(this.lastAllowedAt, now);
    if (!decision.allowed) {
      throw new DomainError(
        ErrorCode.RATE_LIMITED,
        429,
        'Demasiadas llamadas al disparador de tareas. Intenta de nuevo en un momento.',
        { retryAfterSeconds: decision.retryAfterSeconds },
      );
    }
    this.lastAllowedAt = now;
    return true;
  }
}
