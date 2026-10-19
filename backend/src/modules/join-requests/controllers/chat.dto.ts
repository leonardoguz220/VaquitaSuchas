import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export type { UploadedRequestFile } from './join-requests.dto.js';

/** Campos de texto de `POST /join-requests/:id/messages` (multipart; la imagen va aparte). */
export class SendMessageDto {
  // El largo (1 a 1.000) lo valida el dominio: un texto de 1.001 caracteres es un 400 uniforme.
  @ApiPropertyOptional({ minLength: 1, maxLength: 1000 })
  @IsOptional()
  @IsString()
  text?: string;
}

/** Query de `GET /join-requests/:id/messages`. */
export class ListMessagesQueryDto {
  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  afterSeq?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

/** Cuerpo de `POST /join-requests/:id/read`. */
export class MarkReadDto {
  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  upToSeq!: number;
}
