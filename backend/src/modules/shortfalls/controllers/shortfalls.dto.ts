import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Length, MaxLength, Min } from 'class-validator';

/** Versión de la fila que vio la persona: si cambió, la acción responde `409 STALE_STATE`. */
class VersionedDto {
  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  version?: number;
}

/** Cuerpo de `POST /shortfall-rows/:rowId/respond`. */
export class RespondDto extends VersionedDto {
  @ApiProperty({ enum: ['cubrir', 'devolucion'] })
  @IsIn(['cubrir', 'devolucion'])
  choice!: 'cubrir' | 'devolucion';
}

/** Cuerpo de `POST /shortfall-rows/:rowId/pay`. */
export class PayDto extends VersionedDto {
  @ApiProperty({ enum: ['qr', 'transferencia'] })
  @IsIn(['qr', 'transferencia'])
  method!: 'qr' | 'transferencia';

  @ApiProperty({ maxLength: 100 })
  @IsString()
  @MaxLength(100)
  reference!: string;
}

/** Cuerpo de las acciones que solo llevan la versión. */
export class VersionDto extends VersionedDto {}

/** Cuerpo de `POST /shortfall-rows/:rowId/reject-payment`. */
export class RejectPaymentDto extends VersionedDto {
  @ApiProperty({ minLength: 5, maxLength: 200 })
  @IsString()
  @Length(5, 200)
  reason!: string;
}

/** Cuerpo de `POST /shortfall-rows/:rowId/refund`. */
export class SendRefundDto extends VersionedDto {
  @ApiProperty({ enum: ['qr', 'transferencia', 'efectivo'] })
  @IsIn(['qr', 'transferencia', 'efectivo'])
  method!: 'qr' | 'transferencia' | 'efectivo';

  @ApiProperty({ maxLength: 100 })
  @IsString()
  @MaxLength(100)
  reference!: string;
}

/** Cuerpo de `POST /shortfall-rows/:rowId/refund/dispute`. */
export class DisputeRefundDto extends VersionedDto {
  @ApiProperty({ minLength: 5, maxLength: 300 })
  @IsString()
  @Length(5, 300)
  reason!: string;
}
