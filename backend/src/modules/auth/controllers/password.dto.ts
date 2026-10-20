import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class ForgotPasswordDto {
  @ApiProperty({ example: 'ana@example.com' })
  @IsString()
  @MaxLength(254)
  email!: string;
}

export class ResetPasswordDto {
  @ApiProperty({ description: 'Token del enlace recibido por correo.' })
  @IsString()
  @MaxLength(200)
  token!: string;

  @ApiProperty({ minLength: 10 })
  @IsString({ message: 'WEAK_PASSWORD' })
  @MaxLength(200, { message: 'WEAK_PASSWORD' })
  newPassword!: string;

  @ApiProperty()
  @IsString({ message: 'PASSWORD_MISMATCH' })
  @MaxLength(200, { message: 'PASSWORD_MISMATCH' })
  newPasswordConfirmation!: string;
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  @MaxLength(200)
  currentPassword!: string;

  @ApiProperty({ minLength: 10 })
  @IsString({ message: 'WEAK_PASSWORD' })
  @MaxLength(200, { message: 'WEAK_PASSWORD' })
  newPassword!: string;

  @ApiProperty()
  @IsString({ message: 'PASSWORD_MISMATCH' })
  @MaxLength(200, { message: 'PASSWORD_MISMATCH' })
  newPasswordConfirmation!: string;
}
