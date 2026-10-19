import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  isISO8601,
  IsDate,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import {
  ADMIN_AUDIT_ACTIONS,
  AUDIT_TARGET_TYPES,
  type AdminAuditAction,
  type AuditTargetType,
} from '../domain/audit-entry.js';
import { AUDIT_DEFAULT_LIMIT, AUDIT_MAX_LIMIT } from '../services/audit.service.js';

// Solo fechas ISO 8601 estrictas; cualquier otra cosa se deja tal cual para que IsDate la rechace.
const toDate = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' && isISO8601(value, { strict: true }) ? new Date(value) : value;

/** Query de `GET /admin/audit-log` (contracts/api.md). */
export class ListAuditLogQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  adminId?: string;

  @ApiPropertyOptional({ enum: ADMIN_AUDIT_ACTIONS })
  @IsOptional()
  @IsIn(ADMIN_AUDIT_ACTIONS)
  action?: AdminAuditAction;

  @ApiPropertyOptional({ enum: AUDIT_TARGET_TYPES })
  @IsOptional()
  @IsIn(AUDIT_TARGET_TYPES)
  targetType?: AuditTargetType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  targetId?: string;

  @ApiPropertyOptional({ example: '2026-10-01T00:00:00Z' })
  @IsOptional()
  @IsDate()
  @Transform(toDate)
  from?: Date;

  @ApiPropertyOptional({ example: '2026-10-31T23:59:59Z' })
  @IsOptional()
  @IsDate()
  @Transform(toDate)
  to?: Date;

  @ApiPropertyOptional({ minimum: 1, maximum: AUDIT_MAX_LIMIT, default: AUDIT_DEFAULT_LIMIT })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(AUDIT_MAX_LIMIT)
  limit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cursor?: string;
}
