import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, Min } from 'class-validator';
import type { ChargeStatus } from '../domain/charge-state.js';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../services/billing-read.service.js';

const STATUSES: readonly ChargeStatus[] = [
  'pendiente',
  'en_revision',
  'pagado',
  'atrasado',
  'cancelado',
];

/** Acepta `?status=a&status=b` y `?status=a,b`. */
const toList = ({ value }: { value: unknown }): unknown => {
  if (value === undefined || value === null || value === '') return undefined;
  const items = Array.isArray(value) ? value : [value];
  return items.flatMap((item) => (typeof item === 'string' ? item.split(',') : [item]));
};

/** Query de `GET /me/charges` (contracts/api.md). */
export class ListMyChargesQueryDto {
  @ApiPropertyOptional({ enum: STATUSES, isArray: true })
  @IsOptional()
  @Transform(toList)
  @IsIn(STATUSES, { each: true })
  status?: ChargeStatus[];

  @ApiPropertyOptional({ example: '2026-10' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  period?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  groupId?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: MAX_PAGE_SIZE, default: DEFAULT_PAGE_SIZE })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  limit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cursor?: string;
}

/** Query de `GET /groups/:groupId/charges` (contracts/api.md). */
export class ListGroupChargesQueryDto {
  @ApiPropertyOptional({ example: '2026-10' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  period?: string;

  @ApiPropertyOptional({ enum: STATUSES, isArray: true })
  @IsOptional()
  @Transform(toList)
  @IsIn(STATUSES, { each: true })
  status?: ChargeStatus[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: MAX_PAGE_SIZE, default: DEFAULT_PAGE_SIZE })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  limit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cursor?: string;
}

/** Query de `GET /groups/:groupId/billing/summary`. */
export class PeriodSummaryQueryDto {
  @ApiPropertyOptional({ example: '2026-10', description: 'Por omisión, el del último ciclo.' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  period?: string;
}
