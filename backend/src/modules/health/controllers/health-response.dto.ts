import { ApiProperty } from '@nestjs/swagger';

// Forma de la respuesta de GET /health (contracts/api.md, parte B). Solo documenta el contrato.

export class DatabaseHealthDto {
  @ApiProperty({ enum: ['up', 'down'] })
  status!: 'up' | 'down';

  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Milisegundos que tardó SELECT 1; null si la base no respondió.',
  })
  latencyMs!: number | null;
}

export class HealthResponseDto {
  @ApiProperty({ enum: ['ok', 'degraded'] })
  status!: 'ok' | 'degraded';

  @ApiProperty({ example: '0.1.0' })
  version!: string;

  @ApiProperty({ example: 1234, description: 'Segundos desde el arranque del proceso.' })
  uptimeSeconds!: number;

  @ApiProperty({ type: DatabaseHealthDto })
  database!: DatabaseHealthDto;

  @ApiProperty({ example: '2026-10-18T17:00:00.000Z', description: 'Hora del servidor, ISO UTC.' })
  time!: string;
}
