import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { LISTING_SORTS, type ListingSort } from '../domain/search-cursor.js';
import { MAX_LISTING_TEXT, MAX_REQUEST_MESSAGE } from '../services/listings.service.js';
import { MAX_PAGE_SIZE } from '../services/listings-search.service.js';

const CATEGORIES = ['video', 'musica', 'juegos', 'educacion', 'almacenamiento', 'otras'] as const;
const MAX_CENTS = 100_000_000;
const MAX_OFFERED = 19;
const MAX_TEXT = MAX_LISTING_TEXT;
// Tope de entrada generoso: el servicio mide caracteres Unicode tras recortar y responde el detalle.
const MAX_TEXT_INPUT = 2000;

/** Query de `GET /listings` (contrato 008). */
export class SearchListingsQueryDto {
  @ApiPropertyOptional({ description: 'Servicio del catálogo.' })
  @IsOptional()
  @IsUUID()
  serviceId?: string;

  @ApiPropertyOptional({
    description: 'Texto en el nombre del servicio (sin mayúsculas ni tildes).',
  })
  @IsOptional()
  @IsString()
  @Length(1, 60)
  q?: string;

  @ApiPropertyOptional({ enum: CATEGORIES })
  @IsOptional()
  @IsIn(CATEGORIES)
  category?: string;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MAX_CENTS)
  minShareCents?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MAX_CENTS)
  maxShareCents?: number;

  @ApiPropertyOptional({ enum: LISTING_SORTS, default: 'fecha' })
  @IsOptional()
  @IsIn(LISTING_SORTS)
  sort?: ListingSort;

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
  @Length(1, 300)
  cursor?: string;
}

/** Cuerpo de `POST /groups/:groupId/listing` (contrato 008). Los textos se normalizan en el servicio. */
export class PublishListingDto {
  @ApiProperty({ minimum: 1, maximum: 19, description: 'Cupos que se ofrecen (1..libres).' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_OFFERED)
  slotsOffered!: number;

  @ApiPropertyOptional({ maxLength: MAX_TEXT, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_TEXT_INPUT)
  description?: string | null;

  @ApiPropertyOptional({ maxLength: MAX_TEXT, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_TEXT_INPUT)
  conditions?: string | null;
}

/** Cuerpo de `PATCH /groups/:groupId/listing`. */
export class UpdateListingDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 19 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_OFFERED)
  slotsOffered?: number;

  @ApiPropertyOptional({ maxLength: MAX_TEXT, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_TEXT_INPUT)
  description?: string | null;

  @ApiPropertyOptional({ maxLength: MAX_TEXT, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_TEXT_INPUT)
  conditions?: string | null;

  @ApiPropertyOptional({ description: 'Control optimista; si no coincide, `409 STALE_STATE`.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version?: number;
}

/** Cuerpo de `POST /listings/:id/requests`. El máximo de 200 lo valida el servicio (CA-008-08). */
export class RequestSeatDto {
  @ApiPropertyOptional({ maxLength: MAX_REQUEST_MESSAGE, description: 'Primera línea del chat.' })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_TEXT_INPUT)
  message?: string;
}

export const REPORT_REASONS = ['spam', 'datos_falsos', 'conducta_indebida', 'otro'] as const;

/** Cuerpo de `POST /listings/:id/reports`. El máximo de 300 lo valida el servicio. */
export class ReportListingDto {
  @ApiProperty({ enum: REPORT_REASONS })
  @IsIn(REPORT_REASONS)
  reason!: (typeof REPORT_REASONS)[number];

  @ApiPropertyOptional({ maxLength: MAX_TEXT, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_TEXT_INPUT)
  comment?: string | null;
}
