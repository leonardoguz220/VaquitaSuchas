import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Max, Min } from 'class-validator';
import { LISTING_SORTS, type ListingSort } from '../domain/search-cursor.js';
import { MAX_PAGE_SIZE } from '../services/listings-search.service.js';

const CATEGORIES = ['video', 'musica', 'juegos', 'educacion', 'almacenamiento', 'otras'] as const;
const MAX_CENTS = 100_000_000;

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
