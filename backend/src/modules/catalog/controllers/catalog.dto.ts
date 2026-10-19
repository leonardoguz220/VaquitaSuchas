import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength } from 'class-validator';

export class ServiceSlugParams {
  @ApiProperty({ example: 'netflix' })
  @IsString()
  @MaxLength(80)
  @Matches(/^[a-z0-9-]+$/, { message: 'INVALID_SLUG' })
  slug!: string;
}
