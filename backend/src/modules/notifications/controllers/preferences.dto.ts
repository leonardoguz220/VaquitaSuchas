import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

/** Interruptores por categoría de aviso; los omitidos no cambian (RF-005-17). */
export class CategorySwitchesDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() recordatorios?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() resoluciones?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() titular?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() grupo?: boolean;
}

/** Cuerpo de `PUT /notification-preferences`. No existe un campo para la app ni la seguridad. */
export class UpdatePreferencesDto {
  @ApiPropertyOptional({ type: CategorySwitchesDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CategorySwitchesDto)
  email?: CategorySwitchesDto;

  @ApiPropertyOptional({ type: CategorySwitchesDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CategorySwitchesDto)
  telegram?: CategorySwitchesDto;
}

/** Cuerpo de `POST /notifications/unsubscribe`. */
export class UnsubscribeDto {
  @ApiProperty({ description: 'Token firmado del enlace del correo.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  token!: string;
}
