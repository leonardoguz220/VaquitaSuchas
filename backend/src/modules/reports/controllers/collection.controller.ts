import { Controller, Get, Header, Param, Query, Req, UseGuards } from '@nestjs/common';
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
import { requireUserId, uuidParam } from '../../../shared/http/request-user.js';
import { DashboardService, type GroupCollection } from '../services/dashboard.service.js';
import { CollectionQueryDto } from './dashboard.dto.js';

/** Cobranza del grupo para el titular (spec 006, US2). */
@ApiTags('reports')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'UNAUTHENTICATED: sin sesión válida.' })
@UseGuards(AuthGuard)
@Controller('groups/:groupId/collection')
export class CollectionController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Cobranza del grupo por período (RF-006-06)' })
  @ApiForbiddenResponse({ description: 'FORBIDDEN: un miembro que no es titular.' })
  @ApiNotFoundResponse({ description: 'NOT_FOUND: grupo ajeno.' })
  collection(
    @Req() request: AuthenticatedRequest,
    @Param('groupId', uuidParam()) groupId: string,
    @Query() query: CollectionQueryDto,
  ): Promise<GroupCollection> {
    return this.dashboard.groupCollection(requireUserId(request), groupId, query.period ?? null);
  }
}
