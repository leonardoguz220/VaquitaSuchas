import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Max, Min } from 'class-validator';
import type { RequestStatus } from '../domain/request-state.js';
import { MAX_PAGE_SIZE } from '../services/join-requests.service.js';

const STATUSES: readonly RequestStatus[] = [
  'abierta',
  'esperando_pago',
  'pago_informado',
  'aceptada',
  'rechazada',
  'cancelada',
  'expirada',
];

/** Acepta `?status=a&status=b` y `?status=a,b`. */
const toList = ({ value }: { value: unknown }): unknown => {
  if (value === undefined || value === null || value === '') return undefined;
  const items = Array.isArray(value) ? value : [value];
  return items.flatMap((item) => (typeof item === 'string' ? item.split(',') : [item]));
};

/** Cuerpo de `POST /join-requests`. */
export class OpenJoinRequestDto {
  @ApiProperty({ example: 'K7M2Q9XA' })
  @IsString()
  @Length(1, 64)
  code!: string;
}

/** Query de `GET /join-requests` y `GET /groups/:groupId/join-requests`. */
export class ListJoinRequestsQueryDto {
  @ApiPropertyOptional({ enum: ['solicitante', 'titular'] })
  @IsOptional()
  @IsIn(['solicitante', 'titular'])
  role?: 'solicitante' | 'titular';

  @ApiPropertyOptional({ enum: STATUSES, isArray: true })
  @IsOptional()
  @Transform(toList)
  @IsIn(STATUSES, { each: true })
  status?: RequestStatus[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  groupId?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: MAX_PAGE_SIZE })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  limit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 200)
  cursor?: string;
}
