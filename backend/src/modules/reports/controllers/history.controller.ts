import { Controller, Get, Header, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { AuthGuard } from '../../../shared/guards/auth.guard.js';
import type { AuthenticatedRequest } from '../../../shared/guards/authenticated-request.js';
import { requireUserId } from '../../../shared/http/request-user.js';
import { HistoryService, type HistoryPage } from '../services/history.service.js';
import { HistoryQueryDto } from './dashboard.dto.js';

/** Historial propio de cobros (spec 006, US5). */
@ApiTags('reports')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'UNAUTHENTICATED: sin sesión válida.' })
@UseGuards(AuthGuard)
@Controller('me/history')
export class HistoryController {
  constructor(private readonly history: HistoryService) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Historial de cobros propios con filtros (RF-006-13)' })
  list(
    @Req() request: AuthenticatedRequest,
    @Query() query: HistoryQueryDto,
  ): Promise<HistoryPage> {
    return this.history.list(requireUserId(request), {
      period: query.period ?? null,
      groupId: query.groupId ?? null,
      statuses: query.status ?? [],
      limit: query.limit ?? null,
      cursor: query.cursor ?? null,
    });
  }
}
