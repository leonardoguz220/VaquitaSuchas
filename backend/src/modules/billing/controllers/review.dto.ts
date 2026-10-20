import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  Min,
} from 'class-validator';
import { MAX_MANUAL_NOTE_LENGTH } from '../domain/manual-payment.js';

export const MIN_REASON_LENGTH = 5;
export const MAX_REASON_LENGTH = 200;

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/** Cuerpo de `POST /charges/:chargeId/confirm`. */
export class ConfirmChargeDto {
  @ApiPropertyOptional({ description: 'Versión del cobro que el titular tenía en pantalla.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  version?: number;
}

/** Cuerpo de `POST /charges/:chargeId/reject` (RF-002-11). */
export class RejectChargeDto extends ConfirmChargeDto {
  @ApiProperty({ minLength: MIN_REASON_LENGTH, maxLength: MAX_REASON_LENGTH })
  @Transform(trim)
  @IsString()
  @MinLength(MIN_REASON_LENGTH)
  @MaxLength(MAX_REASON_LENGTH)
  reason!: string;

  @ApiProperty({ description: 'El comprobante era inválido (reputación).' })
  @IsBoolean()
  invalidReceipt!: boolean;
}

/** Cuerpo de `POST /charges/:chargeId/manual-payment` (RF-002-12). */
export class ManualPaymentDto extends ConfirmChargeDto {
  @ApiPropertyOptional({ maxLength: MAX_MANUAL_NOTE_LENGTH })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_MANUAL_NOTE_LENGTH)
  note?: string;

  @ApiPropertyOptional({ description: 'ISO 8601; entre la emisión y ahora. Por omisión, ahora.' })
  @IsOptional()
  @IsDateString()
  paidAt?: string;
}

/** Cuerpo de `POST /charges/:chargeId/cancel` (RF-002-13). */
export class CancelChargeDto extends ConfirmChargeDto {
  @ApiProperty({ minLength: MIN_REASON_LENGTH, maxLength: MAX_REASON_LENGTH })
  @Transform(trim)
  @IsString()
  @MinLength(MIN_REASON_LENGTH)
  @MaxLength(MAX_REASON_LENGTH)
  reason!: string;
}
