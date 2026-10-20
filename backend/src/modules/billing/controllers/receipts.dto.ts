import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { MAX_REFERENCE_LENGTH } from '../domain/reference.js';

/** Archivo recibido por `multer` en memoria (el paquete de tipos no está instalado). */
export interface UploadedReceiptFile {
  buffer: Buffer;
}

/** Campos de texto de `POST /charges/:chargeId/receipts` (multipart; el archivo va aparte). */
export class UploadReceiptDto {
  @ApiProperty({ enum: ['qr', 'transferencia'] })
  @IsIn(['qr', 'transferencia'])
  method!: 'qr' | 'transferencia';

  @ApiProperty({ maxLength: MAX_REFERENCE_LENGTH })
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_REFERENCE_LENGTH)
  reference!: string;

  @ApiPropertyOptional({ description: 'Versión del cobro que la persona tenía en pantalla.' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value,
  )
  @IsInt()
  @Min(1)
  version?: number;
}
