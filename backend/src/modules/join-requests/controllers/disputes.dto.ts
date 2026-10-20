import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export type { UploadedRequestFile } from './join-requests.dto.js';

/** Campos de texto de `POST /join-requests/:id/disputes` (multipart; la imagen va aparte). */
export class OpenDisputeDto {
  // El largo (10 a 500) lo valida el servicio: fuera de rango es un 400 uniforme.
  @ApiProperty({ minLength: 10, maxLength: 500 })
  @IsOptional()
  @IsString()
  description?: string;
}

/** Campos de texto de `POST /join-requests/:id/disputes/:disputeId/response`. */
export class RespondDisputeDto {
  @ApiProperty({ minLength: 10, maxLength: 500 })
  @IsOptional()
  @IsString()
  text?: string;
}

/** Cuerpo de `POST /admin/disputes/:disputeId/resolve`. */
export class ResolveDisputeDto {
  @ApiProperty({ enum: ['estafa_confirmada', 'sin_falta'] })
  @IsOptional()
  @IsString()
  result?: string;

  @ApiProperty({ minLength: 10, maxLength: 300 })
  @IsOptional()
  @IsString()
  reason?: string;
}

/** Query de `GET /admin/disputes` (RF-009-20). */
export class ListDisputeQueueQueryDto {
  @ApiPropertyOptional({ enum: ['abierto', 'resuelto'] })
  @IsOptional()
  @IsIn(['abierto', 'resuelto'])
  status?: 'abierto' | 'resuelto';

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cursor?: string;
}
