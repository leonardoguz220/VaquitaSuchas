import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
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
import { ChargesService } from '../services/charges.service.js';
import { ListMyChargesQueryDto } from './charges.dto.js';
import {
  CancelChargeDto,
  ConfirmChargeDto,
  ManualPaymentDto,
  RejectChargeDto,
} from './review.dto.js';
import { requireUserId, uuidParam } from './request-user.js';

/** Cobros (spec 002, US1, US3, US4). Solo traduce HTTP: el acceso y las acciones los decide el servicio. */
@ApiTags('billing')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'UNAUTHENTICATED: sin sesión válida.' })
@UseGuards(AuthGuard)
@Controller()
export class ChargesController {
  constructor(
    private readonly reads: BillingReadService,
    private readonly charges: ChargesService,
  ) {}

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

  @Post('charges/:chargeId/confirm')
  @HttpCode(200)
  @ApiOperation({ summary: 'Confirmar el pago de un cobro en revisión (RF-002-10)' })
  @ApiForbiddenResponse({ description: 'FORBIDDEN: no es el titular.' })
  @ApiNotFoundResponse({ description: 'NOT_FOUND: no existe o no pertenece al grupo.' })
  @ApiConflictResponse({ description: 'INVALID_TRANSITION o STALE_STATE.' })
  confirm(
    @Req() request: AuthenticatedRequest,
    @Param('chargeId', uuidParam()) chargeId: string,
    @Body() body: ConfirmChargeDto,
  ): Promise<ChargeView> {
    return this.charges.confirm(requireUserId(request), chargeId, {
      version: body.version ?? null,
    });
  }

  @Post('charges/:chargeId/reject')
  @HttpCode(200)
  @ApiOperation({ summary: 'Rechazar el comprobante de un cobro en revisión (RF-002-11)' })
  @ApiForbiddenResponse({ description: 'FORBIDDEN: no es el titular.' })
  @ApiNotFoundResponse({ description: 'NOT_FOUND: no existe o no pertenece al grupo.' })
  @ApiConflictResponse({ description: 'INVALID_TRANSITION o STALE_STATE.' })
  reject(
    @Req() request: AuthenticatedRequest,
    @Param('chargeId', uuidParam()) chargeId: string,
    @Body() body: RejectChargeDto,
  ): Promise<ChargeView> {
    return this.charges.reject(requireUserId(request), chargeId, {
      reason: body.reason,
      invalidReceipt: body.invalidReceipt,
      version: body.version ?? null,
    });
  }

  @Post('charges/:chargeId/manual-payment')
  @HttpCode(200)
  @ApiOperation({ summary: 'Registrar un pago en efectivo (RF-002-12)' })
  @ApiForbiddenResponse({ description: 'FORBIDDEN: no es el titular.' })
  @ApiNotFoundResponse({ description: 'NOT_FOUND: no existe o no pertenece al grupo.' })
  @ApiConflictResponse({ description: 'INVALID_TRANSITION o STALE_STATE.' })
  manualPayment(
    @Req() request: AuthenticatedRequest,
    @Param('chargeId', uuidParam()) chargeId: string,
    @Body() body: ManualPaymentDto,
  ): Promise<ChargeView> {
    return this.charges.manualPayment(requireUserId(request), chargeId, {
      note: body.note?.trim() || null,
      paidAt: body.paidAt === undefined ? null : new Date(body.paidAt),
      version: body.version ?? null,
    });
  }

  @Post('charges/:chargeId/cancel')
  @HttpCode(200)
  @ApiOperation({ summary: 'Cancelar un cobro pendiente o atrasado (RF-002-13)' })
  @ApiForbiddenResponse({ description: 'FORBIDDEN: no es el titular.' })
  @ApiNotFoundResponse({ description: 'NOT_FOUND: no existe o no pertenece al grupo.' })
  @ApiConflictResponse({ description: 'INVALID_TRANSITION o STALE_STATE.' })
  cancel(
    @Req() request: AuthenticatedRequest,
    @Param('chargeId', uuidParam()) chargeId: string,
    @Body() body: CancelChargeDto,
  ): Promise<ChargeView> {
    return this.charges.cancel(requireUserId(request), chargeId, {
      reason: body.reason,
      version: body.version ?? null,
    });
  }
}
