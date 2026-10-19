import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { AuthenticatedRequest } from '../../../shared/guards/authenticated-request.js';
import { AuthGuard } from '../../../shared/guards/auth.guard.js';
import type { GroupChargesPage, PeriodSummaryView } from '../services/charge-views.js';
import { GroupBillingService } from '../services/group-billing.service.js';
import { ListGroupChargesQueryDto, PeriodSummaryQueryDto } from './charges.dto.js';
import { requireUserId, uuidParam } from './request-user.js';

/** Resumen del mes e historial del grupo (spec 002, US5). Solo traduce HTTP. */
@ApiTags('billing')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'UNAUTHENTICATED: sin sesión válida.' })
@ApiNotFoundResponse({ description: 'NOT_FOUND: el grupo no existe o no eres miembro.' })
@UseGuards(AuthGuard)
@Controller('groups/:groupId')
export class GroupBillingController {
  constructor(private readonly groupBilling: GroupBillingService) {}

  @Get('billing/summary')
  @ApiOperation({ summary: 'Resumen del mes del grupo (RF-002-16, RF-002-18)' })
  summary(
    @Req() request: AuthenticatedRequest,
    @Param('groupId', uuidParam()) groupId: string,
    @Query() query: PeriodSummaryQueryDto,
  ): Promise<PeriodSummaryView> {
    return this.groupBilling.summary(requireUserId(request), groupId, query.period ?? null);
  }

  @Get('charges')
  @ApiOperation({ summary: 'Historial de cobros del grupo (RF-002-17)' })
  history(
    @Req() request: AuthenticatedRequest,
    @Param('groupId', uuidParam()) groupId: string,
    @Query() query: ListGroupChargesQueryDto,
  ): Promise<GroupChargesPage> {
    return this.groupBilling.history(requireUserId(request), groupId, {
      period: query.period ?? null,
      statuses: query.status ?? [],
      userId: query.userId ?? null,
      limit: query.limit ?? null,
      cursor: query.cursor ?? null,
    });
  }
}
