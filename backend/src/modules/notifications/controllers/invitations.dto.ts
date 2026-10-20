import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, MaxLength } from 'class-validator';

// El mensaje es un código estable: el ValidationPipe lo copia a details.fields.
export class InviteByEmailDto {
  @ApiProperty({ example: 'amigo@example.com' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsEmail({}, { message: 'INVALID_EMAIL' })
  @MaxLength(254, { message: 'INVALID_EMAIL' })
  email!: string;
}
