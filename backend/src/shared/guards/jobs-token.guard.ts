import { Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { DomainError } from '../errors/domain-error.js';
import { ErrorCode } from '../errors/error-codes.js';
import { constantTimeEquals } from './constant-time.js';

export const JOBS_TOKEN_HEADER = 'x-jobs-token';

/**
 * Exige el encabezado `X-Jobs-Token` igual a `JOBS_TOKEN` (`contracts/api.md` A.4 y B). No usa
 * sesión de usuario. Ausente, vacío, repetido o incorrecto responde el mismo
 * `401 UNAUTHENTICATED` (contrato B); la comparación es en tiempo constante.
 * El límite de 1 llamada por segundo del endpoint es de T029, no de este guard.
 */
@Injectable()
export class JobsTokenGuard implements CanActivate {
  private readonly expected: string;

  constructor(config: ConfigService) {
    this.expected = config.getOrThrow<string>('JOBS_TOKEN');
  }

  canActivate(context: ExecutionContext): boolean {
    const received = context.switchToHttp().getRequest<Request>().headers?.[JOBS_TOKEN_HEADER];

    if (typeof received !== 'string' || !constantTimeEquals(received, this.expected)) {
      throw new DomainError(ErrorCode.UNAUTHENTICATED, 401, 'Credencial de servicio inválida.');
    }
    return true;
  }
}
