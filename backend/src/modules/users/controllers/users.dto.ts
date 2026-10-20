import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateProfileDto {
  @ApiProperty({ minLength: 2, maxLength: 80 })
  @IsString({ message: 'INVALID_NAME' })
  @MaxLength(200, { message: 'INVALID_NAME' })
  fullName!: string;

  // Se declaran solo para responder FIELD_NOT_EDITABLE en vez de un campo desconocido.
  @ApiPropertyOptional({ description: 'No editable.' })
  @IsOptional()
  email?: unknown;

  @ApiPropertyOptional({ description: 'No editable.' })
  @IsOptional()
  ci?: unknown;
}
