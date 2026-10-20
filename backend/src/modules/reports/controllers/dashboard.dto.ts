import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, Min } from 'class-validator';
import { MAX_LIST_SIZE } from '../services/dashboard.service.js';

/** Query de `GET /me/dashboard`. */
export class DashboardQueryDto {
  @ApiPropertyOptional({ example: '2026-10' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  month?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  groupId?: string;
}

/** Query de `GET /me/dashboard/lists`. */
export class DashboardListQueryDto {
  @ApiPropertyOptional({ enum: ['debts', 'in_review', 'owed'] })
  @IsIn(['debts', 'in_review', 'owed'])
  list!: 'debts' | 'in_review' | 'owed';

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  groupId?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: MAX_LIST_SIZE })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_LIST_SIZE)
  limit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cursor?: string;
}

/** Query de `GET /groups/:groupId/collection`. */
export class CollectionQueryDto {
  @ApiPropertyOptional({ example: '2026-10' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  period?: string;
}

/** Query de `GET /me/calendar`. */
export class CalendarQueryDto {
  @ApiPropertyOptional({ example: '2026-10' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  month?: string;
}

/** Query de `GET /me/calendar/upcoming`. */
export class UpcomingQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 90, default: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  days?: number;
}

const STATUSES = ['pendiente', 'en_revision', 'pagado', 'atrasado', 'cancelado'] as const;

/** Acepta `?status=a&status=b` y `?status=a,b`. */
const toList = ({ value }: { value: unknown }): unknown => {
  if (value === undefined || value === null || value === '') return undefined;
  const items = Array.isArray(value) ? value : [value];
  return items.flatMap((item) => (typeof item === 'string' ? item.split(',') : [item]));
};

/** Query de `GET /me/history` y de `GET /me/history/export.csv`. */
export class HistoryQueryDto {
  @ApiPropertyOptional({ example: '2026-10' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  period?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  groupId?: string;

  @ApiPropertyOptional({ enum: STATUSES, isArray: true })
  @IsOptional()
  @Transform(toList)
  @IsIn(STATUSES, { each: true })
  status?: string[];

  @ApiPropertyOptional({ minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cursor?: string;
}

/** Query de `GET /groups/:groupId/history/export.csv`. */
export class GroupExportQueryDto {
  @ApiPropertyOptional({ example: '2026-10' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  period?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({ enum: STATUSES, isArray: true })
  @IsOptional()
  @Transform(toList)
  @IsIn(STATUSES, { each: true })
  status?: string[];
}
