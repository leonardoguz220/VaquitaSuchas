import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;
/** Un texto vacío cuenta como ausente. */
const trimOrNull = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() || null : value;

const CURRENCIES = ['USD', 'BS'] as const;

/** Cuerpo de `POST /groups/quote`. */
export class QuoteGroupDto {
  @ApiProperty({ description: 'Precio en centavos de la moneda indicada.', example: 2299 })
  @IsInt()
  @Max(Number.MAX_SAFE_INTEGER)
  priceCents!: number;

  @ApiProperty({ enum: CURRENCIES })
  @IsIn(CURRENCIES)
  currency!: 'USD' | 'BS';

  @ApiPropertyOptional({ nullable: true, example: '6.9600', description: 'Solo con USD.' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  exchangeRate?: string | null;

  @ApiProperty({ minimum: 1, maximum: 20, description: 'Miembros activos, titular incluido.' })
  @IsInt()
  @Min(1)
  @Max(20)
  memberCount!: number;
}

/** Cuerpo de `POST /groups` (RF-001-01 a 05). */
export class CreateGroupDto {
  @ApiPropertyOptional({ nullable: true, example: 'netflix-premium' })
  @IsOptional()
  @Transform(trimOrNull)
  @IsString()
  @MaxLength(80)
  catalogPlanSlug?: string | null;

  @ApiPropertyOptional({ nullable: true, example: 'Mi servicio' })
  @IsOptional()
  @Transform(trimOrNull)
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  customServiceName?: string | null;

  @ApiProperty({ minLength: 2, maxLength: 60, example: 'Netflix del depa' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name!: string;

  @ApiProperty({ description: 'Precio en centavos de la moneda indicada.', example: 2299 })
  @IsInt()
  @Max(Number.MAX_SAFE_INTEGER)
  priceCents!: number;

  @ApiProperty({ enum: CURRENCIES })
  @IsIn(CURRENCIES)
  currency!: 'USD' | 'BS';

  @ApiPropertyOptional({
    nullable: true,
    example: '6.9600',
    description: 'Obligatorio con USD y prohibido con BS.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  exchangeRate?: string | null;

  @ApiProperty({ minimum: 1, maximum: 31 })
  @IsInt()
  @Min(1)
  @Max(31)
  billingDay!: number;

  @ApiProperty({ description: 'Cupos totales, titular incluido (2 a 20).' })
  @IsInt()
  @Max(1000)
  totalSlots!: number;

  @ApiPropertyOptional({ nullable: true, maxLength: 500 })
  @IsOptional()
  @Transform(trimOrNull)
  @IsString()
  @MaxLength(500)
  paymentInfoText?: string | null;
}

/** Cuerpo de `PATCH /groups/:id` (RF-001-14): todos los campos son opcionales. */
export class UpdateGroupDto {
  @ApiPropertyOptional({ minLength: 2, maxLength: 60 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name?: string;

  @ApiPropertyOptional({ description: 'Precio en centavos de la moneda indicada.' })
  @IsOptional()
  @IsInt()
  @Max(Number.MAX_SAFE_INTEGER)
  priceCents?: number;

  @ApiPropertyOptional({ enum: CURRENCIES })
  @IsOptional()
  @IsIn(CURRENCIES)
  currency?: 'USD' | 'BS';

  @ApiPropertyOptional({ nullable: true, example: '6.9600' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  exchangeRate?: string | null;

  @ApiPropertyOptional({ minimum: 1, maximum: 31 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  billingDay?: number;

  @ApiPropertyOptional({ description: 'Cupos totales, titular incluido (2 a 20).' })
  @IsOptional()
  @IsInt()
  @Max(1000)
  totalSlots?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  acceptingMembers?: boolean;

  @ApiPropertyOptional({
    description: 'Versión que el cliente leyó; si no coincide, 409 STALE_STATE.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  version?: number;
}

/** Cuerpo de `POST /groups/:id/transfer-ownership` (RF-001-17). */
export class TransferOwnershipDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  toUserId!: string;
}

/** Cuerpo de `POST /admin/groups/:groupId/transfer-ownership`; el motivo lo valida el servicio. */
export class AdminTransferOwnershipDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  toUserId!: string;

  @ApiProperty({ minLength: 10, maxLength: 300 })
  @IsString()
  reason!: string;
}

/** Query de `GET /groups` (contracts/api.md). */
export class ListGroupsQueryDto {
  @ApiPropertyOptional({ enum: ['titular', 'miembro'] })
  @IsOptional()
  @IsIn(['titular', 'miembro'])
  role?: 'titular' | 'miembro';

  @ApiPropertyOptional({ enum: ['activo', 'cerrado'], default: 'activo' })
  @IsOptional()
  @IsIn(['activo', 'cerrado'])
  status?: 'activo' | 'cerrado';

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

/** Campos de texto de `PUT /groups/:id/payment-info` (multipart; el QR llega como archivo). */
export class PaymentInfoDto {
  @ApiPropertyOptional({ maxLength: 500, description: 'Vacío borra el texto.' })
  @IsOptional()
  @IsString()
  text?: string;

  @ApiPropertyOptional({ description: '`true` borra la imagen del QR.' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  removeQr?: boolean;
}
