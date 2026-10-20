import { Controller, Get, Header, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { Clock } from '../../../shared/clock/clock.js';
import { DbService } from '../../../shared/db/db.service.js';
import { AuthGuard } from '../../../shared/guards/auth.guard.js';
import type { AuthenticatedRequest } from '../../../shared/guards/authenticated-request.js';
import { requireUserId } from '../../../shared/http/request-user.js';
import { BadgesService, type BadgesView } from '../services/badges.service.js';
import { ReputationService } from '../services/reputation.service.js';

/** Mis insignias (spec 007, US2). */
@ApiTags('reputation')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'UNAUTHENTICATED: sin sesión válida.' })
@UseGuards(AuthGuard)
@Controller('users/me/badges')
export class BadgesController {
  constructor(
    private readonly db: DbService,
    private readonly clock: Clock,
    private readonly reputation: ReputationService,
    private readonly badges: BadgesService,
  ) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Mis insignias obtenidas y pendientes con avance (RF-007-06 a 08)' })
  async mine(@Req() request: AuthenticatedRequest): Promise<BadgesView> {
    const userId = requireUserId(request);
    const now = this.clock.now();
    const facts = await this.reputation.loadFacts(this.db, userId, now);
    return this.badges.view(this.db, userId, facts, now);
  }
}
