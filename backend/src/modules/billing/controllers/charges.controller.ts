import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { AuthenticatedRequest } from '../../../shared/guards/authenticated-request.js';
import { AuthGuard } from '../../../shared/guards/auth.guard.js';
import { BillingReadService, DEFAULT_PAGE_SIZE } from '../services/billing-read.service.js';
import type { ChargeView, MyChargesPage } from '../services/charge-views.js';
import { ListMyChargesQueryDto } from './charges.dto.js';
import { requireUserId, uuidParam } from './request-user.js';

/** Lectura de cobros (spec 002, US1). Solo traduce HTTP: el acceso y las acciones los decide el servicio. */
@ApiTags('billing')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'UNAUTHENTICATED: sin sesión válida.' })
@UseGuards(AuthGuard)
@Controller()
export class ChargesController {
  constructor(private readonly reads: BillingReadService) {}

  @Get('me/charges')
  @ApiOperation({ summary: 'Mis cobros (RF-002-15)' })
  listMine(
    @Req() request: AuthenticatedRequest,
    @Query() query: ListMyChargesQueryDto,
  ): Promise<MyChargesPage> {
    return this.reads.listMine(requireUserId(request), {
      statuses: query.status ?? [],
      period: query.period ?? null,
      groupId: query.groupId ?? null,
      limit: query.limit ?? DEFAULT_PAGE_SIZE,
      cursor: query.cursor ?? null,
    });
  }

  @Get('charges/:chargeId')
  @ApiOperation({ summary: 'Detalle de un cobro (RF-002-09)' })
  @ApiForbiddenResponse({ description: 'FORBIDDEN: otro miembro del grupo.' })
  @ApiNotFoundResponse({ description: 'NOT_FOUND: no existe o no pertenece al grupo.' })
  detail(
    @Req() request: AuthenticatedRequest,
    @Param('chargeId', uuidParam()) chargeId: string,
  ): Promise<ChargeView> {
    return this.reads.getCharge(requireUserId(request), chargeId);
  }
}
