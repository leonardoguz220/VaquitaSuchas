import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/** Cuerpo de `POST /charges/:chargeId/reputation-report`. */
export class ReputationReportDto {
  @ApiProperty({ minLength: 10, maxLength: 300 })
  @Transform(trim)
  @IsString()
  @MinLength(10)
  @MaxLength(300)
  comment!: string;
}

/** Cuerpo de `POST /charges/:chargeId/reputation-exclusion`. */
export class ReputationExclusionDto {
  @ApiProperty({ minLength: 10, maxLength: 300 })
  @Transform(trim)
  @IsString()
  @MinLength(10)
  @MaxLength(300)
  reason!: string;
}
