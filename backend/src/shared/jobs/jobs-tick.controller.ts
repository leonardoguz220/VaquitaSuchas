import { Controller, HttpCode, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JobsTokenGuard } from '../guards/jobs-token.guard.js';
import { JobRunner } from './job-runner.js';
import type { JobRunResult } from './scheduled-job.js';
import { TickQueryDto } from './tick-query.dto.js';
import { TickRateLimitGuard } from './tick-rate-limit.guard.js';

/** Respuesta del tick (`contracts/api.md` B): un resultado por tarea, en orden de registro. */
export interface TickResponse {
  readonly ran: readonly JobRunResult[];
}

/**
 * Disparador externo de tareas (RF-000-14): lo llama el cron del servicio (cron-job.org o el
 * workflow `jobs-tick.yml`). Sin sesión de usuario; solo el encabezado `X-Jobs-Token`.
 */
@ApiTags('internal')
@Controller('internal/jobs')
export class JobsTickController {
  constructor(private readonly runner: JobRunner) {}

  // El orden de los guards importa: el límite de 1 llamada por segundo va DESPUÉS del token, para
  // que quien no tiene el token no pueda gastar el cupo y dejar fuera al cron legítimo.
  @UseGuards(JobsTokenGuard, TickRateLimitGuard)
  // El contrato dice 200 (no 201): el tick ejecuta tareas, no crea un recurso.
  @HttpCode(200)
  @Post('tick')
  @ApiOperation({ summary: 'Ejecuta las tareas programadas (RF-000-14)' })
  @ApiHeader({ name: 'X-Jobs-Token', required: true, description: 'Valor de JOBS_TOKEN.' })
  @ApiOkResponse({
    description:
      'Un resultado por tarea: ok (processed), skipped (reason: locked | interval) o error (error).',
  })
  @ApiQuery({
    name: 'job',
    required: false,
    description: 'Ejecuta solo la tarea con este nombre (por ejemplo, example.noop).',
    example: 'example.noop',
  })
  @ApiBadRequestResponse({
    description: 'VALIDATION_ERROR: `job` no tiene un nombre de tarea válido (details.fields.job).',
  })
  @ApiUnauthorizedResponse({
    description: 'UNAUTHENTICATED: falta X-Jobs-Token o no coincide con JOBS_TOKEN.',
  })
  @ApiResponse({
    status: 429,
    description:
      'RATE_LIMITED: más de 1 llamada por segundo; details.retryAfterSeconds indica la espera.',
  })
  async tick(@Query() query: TickQueryDto): Promise<TickResponse> {
    // Un nombre con formato válido pero sin tarea registrada devuelve `ran: []`.
    return { ran: await this.runner.runAll('external', { job: query.job }) };
  }
}
