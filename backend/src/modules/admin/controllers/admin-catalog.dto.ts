import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

/** Cuerpo de `POST /admin/catalog/import/preview`: el contenido del archivo como texto. */
export class ImportPreviewDto {
  @ApiProperty({ enum: ['csv', 'json'] })
  @IsIn(['csv', 'json'])
  format!: 'csv' | 'json';

  @ApiProperty({ description: 'Contenido del archivo CSV o JSON.' })
  @IsString()
  @MinLength(1)
  @MaxLength(500_000)
  content!: string;
}

/** Cuerpo de `POST /admin/catalog/import/apply`. */
export class ImportApplyDto {
  @ApiProperty()
  @IsUUID()
  token!: string;
}
