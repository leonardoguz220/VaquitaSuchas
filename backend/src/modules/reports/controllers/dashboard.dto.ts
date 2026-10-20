import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
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
