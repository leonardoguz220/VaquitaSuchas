import { ApiProperty } from '@nestjs/swagger';
import { Equals, IsEmail, IsString, MaxLength } from 'class-validator';

// Los mensajes son códigos estables: el ValidationPipe los copia a details.fields.
export class RegisterDto {
  @ApiProperty({ example: 'Ana Prueba' })
  @IsString({ message: 'INVALID_NAME' })
  @MaxLength(200, { message: 'INVALID_NAME' })
  fullName!: string;

  @ApiProperty({ example: 'ana@example.com' })
  @IsEmail({}, { message: 'INVALID_EMAIL' })
  @MaxLength(254, { message: 'INVALID_EMAIL' })
  email!: string;

  @ApiProperty({ description: 'Solo dígitos, 5 a 10.', example: '1234567' })
  @IsString({ message: 'INVALID_CI' })
  @MaxLength(40, { message: 'INVALID_CI' })
  ci!: string;

  @ApiProperty({ minLength: 10 })
  @IsString({ message: 'WEAK_PASSWORD' })
  @MaxLength(200, { message: 'WEAK_PASSWORD' })
  password!: string;

  @ApiProperty()
  @IsString({ message: 'PASSWORD_MISMATCH' })
  @MaxLength(200, { message: 'PASSWORD_MISMATCH' })
  passwordConfirmation!: string;

  @ApiProperty({ enum: [true] })
  @Equals(true, { message: 'POLICY_NOT_ACCEPTED' })
  acceptDataPolicy!: true;
}
