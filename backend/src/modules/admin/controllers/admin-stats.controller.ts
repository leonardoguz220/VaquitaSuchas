import { Controller, Get, Header, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AdminGuard } from '../../../shared/guards/admin.guard.js';
import { AuthGuard } from '../../../shared/guards/auth.guard.js';
import type { PlatformStats } from '../repositories/stats.repository.js';
import { StatsService } from '../services/stats.service.js';

/** Tablero de estadísticas agregadas (RF-009-15 a 17). */
@ApiTags('admin')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'UNAUTHENTICATED: sin sesión válida.' })
@ApiForbiddenResponse({ description: 'FORBIDDEN: la persona no es administradora.' })
@UseGuards(AuthGuard, AdminGuard)
@Controller('admin/stats')
export class AdminStatsController {
  constructor(private readonly stats: StatsService) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Estadísticas agregadas de la plataforma, con caché de 5 minutos' })
  get(): Promise<PlatformStats> {
    return this.stats.get();
  }
}
