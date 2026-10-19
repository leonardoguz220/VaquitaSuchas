import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

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
