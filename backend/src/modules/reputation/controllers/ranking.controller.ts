import { Controller, Get, Header, Param, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuthGuard } from '../../../shared/guards/auth.guard.js';
import type { AuthenticatedRequest } from '../../../shared/guards/authenticated-request.js';
import { requireUserId, uuidParam } from '../../../shared/http/request-user.js';
import { RankingService, type RankingResponse } from '../services/ranking.service.js';

/** Ranking de puntualidad del grupo (spec 007, US3). */
@ApiTags('reputation')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'UNAUTHENTICATED: sin sesión válida.' })
@UseGuards(AuthGuard)
@Controller('groups/:groupId/ranking')
export class RankingController {
  constructor(private readonly ranking: RankingService) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Ranking de puntualidad del grupo (RF-007-09 a 11)' })
  @ApiNotFoundResponse({ description: 'NOT_FOUND: la persona no es miembro del grupo.' })
  get(
    @Req() request: AuthenticatedRequest,
    @Param('groupId', uuidParam()) groupId: string,
  ): Promise<RankingResponse> {
    return this.ranking.ranking(requireUserId(request), groupId);
  }
}
