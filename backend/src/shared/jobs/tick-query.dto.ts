import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, Validate, ValidatorConstraint } from 'class-validator';
import type { ValidatorConstraintInterface } from 'class-validator';
import { isValidJobName } from './domain/job-rules.js';

// La regla de formato vive en el dominio (`isValidJobName`); aquí solo se conecta a class-validator.
// El mensaje es un código estable: el filtro lo entrega en `details.fields.job` (A.2).
@ValidatorConstraint({ name: 'isJobName', async: false })
class IsJobNameConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return isValidJobName(value);
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
}
