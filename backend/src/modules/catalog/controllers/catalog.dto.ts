import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { CATEGORIES, type Category } from '../domain/categories.js';
import { MAX_CATALOG_PAGE_SIZE } from '../services/catalog.service.js';

export class ServiceSlugParams {
  @ApiProperty({ example: 'netflix' })
  @IsString()
  @MaxLength(80)
  @Matches(/^[a-z0-9-]+$/, { message: 'INVALID_SLUG' })
  slug!: string;
}

export class ListServicesQuery {
  @ApiPropertyOptional({ enum: CATEGORIES.map((c) => c.value) })
  @IsOptional()
  @IsIn(CATEGORIES.map((c) => c.value), { message: 'INVALID_CATEGORY' })
  category?: Category;

  @ApiPropertyOptional({ minLength: 1, maxLength: 60, description: 'Sin tildes ni mayúsculas.' })
  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'INVALID_SEARCH' })
  @MaxLength(60, { message: 'INVALID_SEARCH' })
  q?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: MAX_CATALOG_PAGE_SIZE })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_CATALOG_PAGE_SIZE)
  limit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  cursor?: string;
}
