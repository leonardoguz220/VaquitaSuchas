import { Controller, Get, Header } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { HealthService } from '../services/health.service.js';
import { HealthResponseDto } from './health-response.dto.js';

// Ruta pública a propósito: la consultan el despliegue, el cron y la página /estado sin sesión.
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  // El estado cambia en cada consulta: ningún proxy ni navegador debe servirlo desde caché.
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Estado del servicio y de la base de datos (RF-000-09)' })
  @ApiOkResponse({
    type: HealthResponseDto,
    description: '200 también cuando la base falla: entonces status es "degraded".',
  })
  check(): Promise<HealthResponseDto> {
    return this.health.check();
  }
}
