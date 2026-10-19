import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'ana@example.com' })
  @IsString()
  @MaxLength(254)
  email!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(200)
  password!: string;
}
