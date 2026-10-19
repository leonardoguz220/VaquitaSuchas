import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { MAX_REFERENCE_LENGTH } from '../../billing/domain/reference.js';
import { MAX_PAYMENT_TEXT } from '../domain/payment-info.js';
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

/** Archivo recibido por `multer` en memoria (el paquete de tipos no está instalado). */
export interface UploadedRequestFile {
  buffer: Buffer;
}

/** `version` llega como texto en `multipart/form-data`. */
const toVersion = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;

/** Campos de texto de `POST /join-requests/:id/payment-data` (multipart; el QR va aparte). */
export class PaymentDataDto {
  @ApiPropertyOptional({ maxLength: MAX_PAYMENT_TEXT })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_PAYMENT_TEXT)
  text?: string;

  @ApiPropertyOptional({ description: 'Versión de la solicitud que el titular tenía en pantalla.' })
  @IsOptional()
  @Transform(toVersion)
  @IsInt()
  @Min(1)
  version?: number;
}

/** Campos de texto de `POST /join-requests/:id/proof` (multipart; el archivo va aparte). */
export class UploadProofDto {
  @ApiProperty({ enum: ['qr', 'transferencia'] })
  @IsIn(['qr', 'transferencia'])
  method!: 'qr' | 'transferencia';

  @ApiProperty({ maxLength: MAX_REFERENCE_LENGTH })
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_REFERENCE_LENGTH)
  reference!: string;

  @ApiPropertyOptional({ description: 'Versión de la solicitud que la persona tenía en pantalla.' })
  @IsOptional()
  @Transform(toVersion)
  @IsInt()
  @Min(1)
  version?: number;
}

/** Cuerpo de `POST /join-requests/:id/{confirm,cash-payment}`. */
export class DecisionDto {
  @ApiPropertyOptional({ description: 'Versión de la solicitud que el titular tenía en pantalla.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  version?: number;
}

/** Cuerpo de `POST /join-requests/:id/reject` (RF-010-16); el largo del motivo lo valida el servicio. */
export class RejectDto extends DecisionDto {
  @ApiProperty({ minLength: 5, maxLength: 200 })
  @IsString()
  @MaxLength(1000)
  reason!: string;

  @ApiPropertyOptional({ description: 'Solo en pago_informado: el comprobante parece falso.' })
  @IsOptional()
  @IsBoolean()
  markProofAsFalse?: boolean;
}
