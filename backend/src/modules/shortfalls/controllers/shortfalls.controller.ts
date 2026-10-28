import { Body, Controller, Get, HttpCode, Param, Post, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import type { AuthenticatedRequest } from '../../../shared/guards/authenticated-request.js';
import { AuthGuard } from '../../../shared/guards/auth.guard.js';
import { requireUserId, uuidParam } from '../../../shared/http/request-user.js';
import { ShortfallActionsService } from '../services/shortfall-actions.service.js';
import { ShortfallsService } from '../services/shortfalls.service.js';
import type {
  MyShortfallView,
  ShortfallQuoteView,
  ShortfallRoundView,
  ShortfallRowView,
} from '../services/shortfall-views.js';
import {
  DisputeRefundDto,
  PayDto,
  RejectPaymentDto,
  RespondDto,
  SendRefundDto,
  VersionDto,
} from './shortfalls.dto.js';

/** Faltante de grupo (spec 011). Solo traduce HTTP: el acceso y las reglas los decide el servicio. */
@ApiTags('shortfalls')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'UNAUTHENTICATED: sin sesión válida.' })
@ApiForbiddenResponse({ description: 'FORBIDDEN: miembro sin el rol necesario.' })
@ApiNotFoundResponse({ description: 'NOT_FOUND: el recurso no existe o es ajeno.' })
@UseGuards(AuthGuard)
@Controller()
export class ShortfallsController {
  constructor(
    private readonly service: ShortfallsService,
    private readonly actions: ShortfallActionsService,
  ) {}

  @Get('groups/:groupId/shortfall/preview')
  @ApiOperation({ summary: 'Cotización del faltante, sin abrir nada (RF-011-01)' })
  preview(
    @Req() request: AuthenticatedRequest,
    @Param('groupId', uuidParam()) groupId: string,
  ): Promise<ShortfallQuoteView> {
    return this.service.preview(requireUserId(request), groupId);
  }

  @Post('groups/:groupId/shortfall')
  @ApiOperation({ summary: 'El titular abre la ronda y avisa al grupo (RF-011-04)' })
  @ApiUnprocessableEntityResponse({
    description:
      'NO_SHORTFALL, ROUND_ALREADY_OPEN, ROUND_LIMIT_REACHED, GROUP_CLOSED o GROUP_FROZEN.',
  })
  open(
    @Req() request: AuthenticatedRequest,
    @Param('groupId', uuidParam()) groupId: string,
  ): Promise<ShortfallRoundView> {
    return this.service.open(requireUserId(request), groupId);
  }

  @Get('groups/:groupId/shortfall')
  @ApiOperation({
    summary: 'Ronda abierta o la última del grupo (titular: completa; afectado: su fila)',
  })
  current(
    @Req() request: AuthenticatedRequest,
    @Param('groupId', uuidParam()) groupId: string,
  ): Promise<ShortfallRoundView | null> {
    return this.service.current(requireUserId(request), groupId);
  }

  @Post('shortfall-rounds/:roundId/cancel')
  @HttpCode(200)
  @ApiOperation({ summary: 'El titular cancela la ronda si nadie respondió (RF-011-06)' })
  @ApiUnprocessableEntityResponse({ description: 'ROUND_HAS_RESPONSES.' })
  cancel(
    @Req() request: AuthenticatedRequest,
    @Param('roundId', uuidParam()) roundId: string,
  ): Promise<ShortfallRoundView> {
    return this.service.cancel(requireUserId(request), roundId);
  }

  @Get('me/shortfalls')
  @ApiOperation({ summary: 'Mis faltantes (HU-011-02)' })
  mine(@Req() request: AuthenticatedRequest): Promise<MyShortfallView[]> {
    return this.service.mine(requireUserId(request));
  }

  @Post('shortfall-rows/:rowId/respond')
  @HttpCode(200)
  @ApiOperation({ summary: 'El afectado elige cubrir o devolución (RF-011-08 y 09)' })
  @ApiConflictResponse({ description: 'INVALID_TRANSITION o STALE_STATE.' })
  @ApiUnprocessableEntityResponse({ description: 'DEADLINE_PASSED, GROUP_CLOSED o GROUP_FROZEN.' })
  respond(
    @Req() request: AuthenticatedRequest,
    @Param('rowId', uuidParam()) rowId: string,
    @Body() body: RespondDto,
  ): Promise<ShortfallRowView> {
    return this.actions.respond(requireUserId(request), rowId, body);
  }

  @Post('shortfall-rows/:rowId/pay')
  @HttpCode(200)
  @ApiOperation({ summary: 'El afectado informa su pago adicional (RF-011-10)' })
  @ApiConflictResponse({ description: 'INVALID_TRANSITION o STALE_STATE.' })
  @ApiUnprocessableEntityResponse({ description: 'DEADLINE_PASSED, GROUP_CLOSED o GROUP_FROZEN.' })
  pay(
    @Req() request: AuthenticatedRequest,
    @Param('rowId', uuidParam()) rowId: string,
    @Body() body: PayDto,
  ): Promise<ShortfallRowView> {
    return this.actions.pay(requireUserId(request), rowId, body);
  }

  @Post('shortfall-rows/:rowId/confirm-payment')
  @HttpCode(200)
  @ApiOperation({ summary: 'El titular confirma el pago adicional (RF-011-10)' })
  @ApiConflictResponse({ description: 'INVALID_TRANSITION o STALE_STATE.' })
  confirmPayment(
    @Req() request: AuthenticatedRequest,
    @Param('rowId', uuidParam()) rowId: string,
    @Body() body: VersionDto,
  ): Promise<ShortfallRowView> {
    return this.actions.confirmPayment(requireUserId(request), rowId, body);
  }

  @Post('shortfall-rows/:rowId/reject-payment')
  @HttpCode(200)
  @ApiOperation({ summary: 'El titular rechaza el pago adicional con motivo (RF-011-10)' })
  @ApiConflictResponse({ description: 'INVALID_TRANSITION o STALE_STATE.' })
  rejectPayment(
    @Req() request: AuthenticatedRequest,
    @Param('rowId', uuidParam()) rowId: string,
    @Body() body: RejectPaymentDto,
  ): Promise<ShortfallRowView> {
    return this.actions.rejectPayment(requireUserId(request), rowId, body);
  }

  @Post('shortfall-rows/:rowId/refund')
  @HttpCode(200)
  @ApiOperation({ summary: 'El titular registra la devolución hecha (RF-011-12)' })
  @ApiConflictResponse({ description: 'INVALID_TRANSITION o STALE_STATE.' })
  sendRefund(
    @Req() request: AuthenticatedRequest,
    @Param('rowId', uuidParam()) rowId: string,
    @Body() body: SendRefundDto,
  ): Promise<ShortfallRowView> {
    return this.actions.sendRefund(requireUserId(request), rowId, body);
  }

  @Post('shortfall-rows/:rowId/refund/confirm')
  @HttpCode(200)
  @ApiOperation({ summary: 'El afectado confirma que recibió su devolución (RF-011-12)' })
  @ApiConflictResponse({ description: 'INVALID_TRANSITION o STALE_STATE.' })
  confirmRefund(
    @Req() request: AuthenticatedRequest,
    @Param('rowId', uuidParam()) rowId: string,
    @Body() body: VersionDto,
  ): Promise<ShortfallRowView> {
    return this.actions.confirmRefund(requireUserId(request), rowId, body);
  }

  @Post('shortfall-rows/:rowId/refund/dispute')
  @HttpCode(200)
  @ApiOperation({ summary: 'El afectado disputa la devolución (RF-011-13)' })
  @ApiConflictResponse({ description: 'INVALID_TRANSITION o STALE_STATE.' })
  disputeRefund(
    @Req() request: AuthenticatedRequest,
    @Param('rowId', uuidParam()) rowId: string,
    @Body() body: DisputeRefundDto,
  ): Promise<ShortfallRowView> {
    return this.actions.disputeRefund(requireUserId(request), rowId, body);
  }
}
