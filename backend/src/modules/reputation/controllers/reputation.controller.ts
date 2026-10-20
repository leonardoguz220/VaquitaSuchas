import { Controller, Get, Header, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { Clock } from '../../../shared/clock/clock.js';
import { DbService } from '../../../shared/db/db.service.js';
import { AuthGuard } from '../../../shared/guards/auth.guard.js';
import type { AuthenticatedRequest } from '../../../shared/guards/authenticated-request.js';
import { requireUserId } from '../../../shared/http/request-user.js';
import {
  ReputationQueryService,
  type ReputationDetail,
} from '../services/reputation-query.service.js';

/**
 * Calificación de la propia persona (spec 007). No hay endpoint por usuario: la calificación de
 * otras personas solo la ven los flujos autorizados (RNF-007-04).
 */
@ApiTags('reputation')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'UNAUTHENTICATED: sin sesión válida.' })
@UseGuards(AuthGuard)
@Controller('users/me/reputation')
export class ReputationController {
  constructor(
    private readonly db: DbService,
    private readonly clock: Clock,
    private readonly query: ReputationQueryService,
  ) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary: 'Mi calificación de puntualidad y mi habilitación como titular (RF-007-01 a 05, 15)',
  })
  detail(@Req() request: AuthenticatedRequest): Promise<ReputationDetail> {
    return this.query.getDetail(this.db, requireUserId(request), this.clock.now());
  }
}
