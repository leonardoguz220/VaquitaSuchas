import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { USERS_DEFAULT_LIMIT, USERS_MAX_LIMIT } from '../services/users-admin.service.js';

const STATUSES = ['activo', 'suspendido', 'baneado'] as const;
const ROLES = ['usuario', 'admin'] as const;

/** Query de `GET /admin/users`. */
export class ListUsersQueryDto {
  @ApiPropertyOptional({ description: 'Nombre o correo, sin tildes ni mayúsculas.' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ enum: STATUSES })
  @IsOptional()
  @IsIn(STATUSES)
  status?: (typeof STATUSES)[number];

  @ApiPropertyOptional({ enum: ROLES })
  @IsOptional()
  @IsIn(ROLES)
  role?: (typeof ROLES)[number];

  @ApiPropertyOptional({ minimum: 1, maximum: USERS_MAX_LIMIT, default: USERS_DEFAULT_LIMIT })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(USERS_MAX_LIMIT)
  limit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cursor?: string;
}

// La longitud del motivo (10 a 300 tras recortar) la valida el servicio con `requireReason`.
export class ReasonDto {
  @ApiProperty({ minLength: 10, maxLength: 300 })
  @IsString()
  reason!: string;
}

export class OptionalReasonDto {
  @ApiPropertyOptional({ minLength: 10, maxLength: 300 })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class BanDto extends ReasonDto {
  @ApiPropertyOptional({ description: 'Reclamo que origina el baneo.' })
  @IsOptional()
  @IsUUID()
  disputeId?: string;
}

export class ChangeRoleDto extends ReasonDto {
  @ApiProperty({ enum: ROLES })
  @IsIn(ROLES)
  role!: (typeof ROLES)[number];
}
