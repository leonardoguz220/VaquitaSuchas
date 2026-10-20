import { Controller, Get, Header, Query, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuthGuard } from '../../../shared/guards/auth.guard.js';
import type { AuthenticatedRequest } from '../../../shared/guards/authenticated-request.js';
import { requireUserId } from '../../../shared/http/request-user.js';
import {
  DashboardService,
  type ChargeLinesPage,
  type DashboardSummary,
} from '../services/dashboard.service.js';
import { DashboardListQueryDto, DashboardQueryDto } from './dashboard.dto.js';

/** Panel del usuario (spec 006). Solo traduce HTTP; las respuestas no se guardan en caché (RNF-006-02). */
@ApiTags('reports')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'UNAUTHENTICATED: sin sesión válida.' })
@UseGuards(AuthGuard)
@Controller('me/dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Resumen del panel: gasto, ahorro y deudas (RF-006-01 a 06)' })
  @ApiNotFoundResponse({ description: 'NOT_FOUND: el grupo no es del usuario.' })
  summary(
    @Req() request: AuthenticatedRequest,
    @Query() query: DashboardQueryDto,
  ): Promise<DashboardSummary> {
    return this.dashboard.summary(requireUserId(request), {
      month: query.month ?? null,
      groupId: query.groupId ?? null,
    });
  }

  @Get('lists')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Listas del panel: debo, en revisión y me deben (RF-006-04, 05)' })
  @ApiNotFoundResponse({ description: 'NOT_FOUND: el grupo no es del usuario.' })
  @ApiForbiddenResponse({ description: 'FORBIDDEN: «me deben» sin ser titular.' })
  lists(
    @Req() request: AuthenticatedRequest,
    @Query() query: DashboardListQueryDto,
  ): Promise<ChargeLinesPage> {
    return this.dashboard.list(requireUserId(request), {
      list: query.list,
      groupId: query.groupId ?? null,
      limit: query.limit ?? null,
      cursor: query.cursor ?? null,
    });
  }
}
