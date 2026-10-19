import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class SimulateTelegramDto {
  @ApiProperty({ enum: ['start', 'contact'] })
  @IsIn(['start', 'contact'])
  kind!: 'start' | 'contact';

  @ApiProperty()
  @IsInt()
  @Min(1)
  telegramUserId!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  token?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phoneNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  contactUserId?: number;
}

export class OutboxQueryDto {
  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  telegramUserId!: number;
}
