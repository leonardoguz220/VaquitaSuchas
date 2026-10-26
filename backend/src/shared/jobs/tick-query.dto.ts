import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, Validate, ValidatorConstraint } from 'class-validator';
import type { ValidatorConstraintInterface } from 'class-validator';
import { isValidJobName, parseSimulatedNow } from './domain/job-rules.js';

// La regla de formato vive en el dominio (`isValidJobName`); aquí solo se conecta a class-validator.
// El mensaje es un código estable: el filtro lo entrega en `details.fields.job` (A.2).
@ValidatorConstraint({ name: 'isJobName', async: false })
class IsJobNameConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return isValidJobName(value);
  }
}

@ValidatorConstraint({ name: 'isSimulatedNow', async: false })
class IsSimulatedNowConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return parseSimulatedNow(value) !== null;
  }
}

/** Query de `POST /internal/jobs/tick`. */
export class TickQueryDto {
  @ApiPropertyOptional({
    description: 'Ejecuta solo la tarea con este nombre (por ejemplo, example.noop).',
    example: 'example.noop',
  })
  @IsOptional()
  @Validate(IsJobNameConstraint, { message: 'INVALID_JOB_NAME' })
  job?: string;

  @ApiPropertyOptional({
    description:
      'Fecha simulada para las tareas (YYYY-MM-DD o ISO con zona). Solo en development y test; ' +
      'en production se rechaza con 400.',
    example: '2026-11-15',
  })
  @IsOptional()
  @Validate(IsSimulatedNowConstraint, { message: 'INVALID_SIMULATED_NOW' })
  now?: string;
}
