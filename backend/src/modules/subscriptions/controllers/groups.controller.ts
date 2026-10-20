import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiCreatedResponse,
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
import { GroupMemberGuard } from './group-member.guard.js';
import { GroupOwnerGuard } from './group-owner.guard.js';
import {
  CreateGroupDto,
  ListGroupsQueryDto,
  PaymentInfoDto,
  QuoteGroupDto,
  TransferOwnershipDto,
  UpdateGroupDto,
} from './groups.dto.js';
import { GroupsService, type HostEligibilityView } from '../services/groups.service.js';
import { InviteCodeService } from '../services/invite-code.service.js';
import { GroupViewService } from '../services/group-view.service.js';
import { MAX_QR_BYTES } from '../domain/payment-info.js';
import { PaymentInfoService, type PaymentInfoView } from '../services/payment-info.service.js';
import { MembershipService } from '../services/membership.service.js';
import type { GroupDetail } from '../domain/group-detail.js';

/** Alta de grupos y elegibilidad (spec 001, US1). Solo traduce HTTP. */
@ApiTags('groups')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'UNAUTHENTICATED: sin sesión válida.' })
@UseGuards(AuthGuard)
@Controller()
export class GroupsController {
  constructor(
    private readonly groups: GroupsService,
    private readonly view: GroupViewService,
  ) {}

  @Get('groups')
  @ApiOperation({ summary: 'Mis suscripciones: solo los grupos del usuario (RF-001-19)' })
  list(@Req() request: AuthenticatedRequest, @Query() query: ListGroupsQueryDto) {
    return this.view.list(requireUserId(request), {
      ...(query.role && { role: query.role }),
      ...(query.status && { status: query.status }),
      ...(query.limit !== undefined && { limit: query.limit }),
      ...(query.cursor !== undefined && { cursor: query.cursor }),
    });
  }

  @Get('users/me/host-eligibility')
  @ApiOperation({ summary: 'Elegibilidad para ser titular (RF-001-21)' })
  hostEligibility(@Req() request: AuthenticatedRequest): Promise<HostEligibilityView> {
    return this.groups.hostEligibility(requireUserId(request));
  }

  @Post('groups/quote')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Cotiza el total en Bs y la cuota por miembro, sin efectos (RF-001-04)',
  })
  quote(@Body() body: QuoteGroupDto) {
    return this.groups.quote({
      priceCents: body.priceCents,
      currency: body.currency,
      exchangeRate: body.exchangeRate ?? null,
      memberCount: body.memberCount,
    });
  }

  @Post('groups')
  @ApiOperation({ summary: 'Crear una suscripción compartida como titular (RF-001-01 a 05)' })
  @ApiCreatedResponse({ description: 'GroupDetail con inviteCode.' })
  @ApiNotFoundResponse({ description: 'NOT_FOUND: el plan no existe o está inactivo.' })
  @ApiUnprocessableEntityResponse({
    description:
      'NOT_HOST_ELIGIBLE, TOO_MANY_ACTIVE_GROUPS o BUSINESS_RULE (RN-001-09, RN-001-13).',
  })
  create(@Req() request: AuthenticatedRequest, @Body() body: CreateGroupDto): Promise<GroupDetail> {
    return this.groups.create(requireUserId(request), {
      catalogPlanSlug: body.catalogPlanSlug ?? null,
      customServiceName: body.customServiceName ?? null,
      name: body.name,
      priceCents: body.priceCents,
      currency: body.currency,
      exchangeRate: body.exchangeRate ?? null,
      billingDay: body.billingDay,
      totalSlots: body.totalSlots,
      paymentInfoText: body.paymentInfoText ?? null,
    });
  }
}

/** Miembros del grupo (spec 001, US4). */
@ApiTags('groups')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'UNAUTHENTICATED: sin sesión válida.' })
@ApiNotFoundResponse({
  description: 'NOT_FOUND: el grupo no existe, no eres miembro o no es miembro activo.',
})
@ApiForbiddenResponse({ description: 'FORBIDDEN: no eres el titular.' })
@UseGuards(AuthGuard, GroupOwnerGuard)
@Controller('groups/:id/members')
export class MembersController {
  constructor(private readonly membership: MembershipService) {}

  @Delete(':userId')
  @ApiOperation({ summary: 'Quitar a un miembro (RF-001-15); sus cobros se conservan' })
  @ApiUnprocessableEntityResponse({
    description: 'BUSINESS_RULE RN-001-08: no se quita al titular.',
  })
  remove(
    @Param('id') groupId: string,
    @Param('userId', uuidParam()) userId: string,
  ): Promise<{ removedUserId: string; openCharges: number }> {
    return this.membership.removeMember(groupId, userId, 'quitado');
  }
}

/** Abandonar el grupo (spec 001, US5, RF-001-16). Cualquier miembro activo; el servicio decide si puede. */
@ApiTags('groups')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'UNAUTHENTICATED: sin sesión válida.' })
@ApiNotFoundResponse({ description: 'NOT_FOUND: el grupo no existe o no eres miembro activo.' })
@UseGuards(AuthGuard, GroupMemberGuard)
@Controller('groups/:id/leave')
export class LeaveController {
  constructor(private readonly membership: MembershipService) {}

  @Post()
  @HttpCode(204)
  @ApiOperation({ summary: 'Abandonar el grupo (RF-001-16)' })
  @ApiUnprocessableEntityResponse({
    description:
      'BUSINESS_RULE: RN-001-08 (el titular no abandona; hint TRANSFER_OR_CLOSE) o RF-001-16 (cobros sin pagar; details.openCharges).',
  })
  async leave(@Param('id') groupId: string, @Req() request: AuthenticatedRequest): Promise<void> {
    await this.membership.leave(groupId, requireUserId(request));
  }
}

/** Edición, transferencia y cierre del grupo (spec 001, US6 y US7). Solo el titular. */
@ApiTags('groups')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'UNAUTHENTICATED: sin sesión válida.' })
@ApiNotFoundResponse({ description: 'NOT_FOUND: el grupo no existe o no eres miembro activo.' })
@ApiForbiddenResponse({ description: 'FORBIDDEN: no eres el titular.' })
@UseGuards(AuthGuard, GroupOwnerGuard)
@Controller('groups/:id')
export class GroupAdminController {
  constructor(
    private readonly groups: GroupsService,
    private readonly membership: MembershipService,
  ) {}

  @Patch()
  @ApiOperation({ summary: 'Editar el grupo (RF-001-14, RF-001-09)' })
  @ApiConflictResponse({ description: 'STALE_STATE: la version no coincide.' })
  @ApiUnprocessableEntityResponse({
    description:
      'SLOTS_BELOW_MEMBERS (details.minSlots), BUSINESS_RULE (RN-001-13, RN-001-09), GROUP_CLOSED o GROUP_FROZEN.',
  })
  update(@Param('id') groupId: string, @Body() body: UpdateGroupDto): Promise<GroupDetail> {
    return this.groups.update(groupId, {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.priceCents !== undefined && { priceCents: body.priceCents }),
      ...(body.currency !== undefined && { currency: body.currency }),
      ...(body.exchangeRate !== undefined && { exchangeRate: body.exchangeRate }),
      ...(body.billingDay !== undefined && { billingDay: body.billingDay }),
      ...(body.totalSlots !== undefined && { totalSlots: body.totalSlots }),
      ...(body.acceptingMembers !== undefined && { acceptingMembers: body.acceptingMembers }),
      ...(body.version !== undefined && { version: body.version }),
    });
  }

  @Post('transfer-ownership')
  @HttpCode(200)
  @ApiOperation({ summary: 'Transferir la titularidad a otro miembro (RF-001-17)' })
  @ApiUnprocessableEntityResponse({
    description:
      'BUSINESS_RULE (RF-001-17, RN-010-09), NOT_HOST_ELIGIBLE (RF-001-21), TOO_MANY_ACTIVE_GROUPS (RN-001-14), GROUP_CLOSED o GROUP_FROZEN.',
  })
  transfer(
    @Param('id') groupId: string,
    @Req() request: AuthenticatedRequest,
    @Body() body: TransferOwnershipDto,
  ): Promise<GroupDetail> {
    return this.membership.transferOwnership(groupId, requireUserId(request), body.toUserId);
  }

  @Post('close')
  @HttpCode(200)
  @ApiOperation({ summary: 'Cerrar el grupo: queda de solo lectura (RF-001-18)' })
  @ApiUnprocessableEntityResponse({
    description: 'BUSINESS_RULE RN-010-09 (solicitudes en pago), GROUP_CLOSED o GROUP_FROZEN.',
  })
  close(@Param('id') groupId: string, @Req() request: AuthenticatedRequest): Promise<GroupDetail> {
    return this.membership.close(groupId, requireUserId(request));
  }
}

/** Detalle del grupo para un miembro activo (spec 001, US3). */
@ApiTags('groups')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'UNAUTHENTICATED: sin sesión válida.' })
@ApiNotFoundResponse({ description: 'NOT_FOUND: el grupo no existe o no eres miembro activo.' })
@UseGuards(AuthGuard, GroupMemberGuard)
@Controller('groups/:id')
export class GroupViewController {
  constructor(private readonly view: GroupViewService) {}

  @Get()
  @ApiOperation({ summary: 'Detalle del grupo (RF-001-12, RF-001-13)' })
  @ApiOkResponse({ description: 'GroupDetail; inviteCode solo para el titular.' })
  detail(@Param('id') groupId: string, @Req() request: AuthenticatedRequest): Promise<GroupDetail> {
    return this.view.detail(groupId, requireUserId(request));
  }
}

/** Datos de pago del titular (spec 001, US1, RF-001-20). */
@ApiTags('groups')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'UNAUTHENTICATED: sin sesión válida.' })
@ApiNotFoundResponse({ description: 'NOT_FOUND: el grupo no existe o no eres miembro activo.' })
@ApiForbiddenResponse({ description: 'FORBIDDEN: no eres el titular.' })
@UseGuards(AuthGuard, GroupOwnerGuard)
@Controller('groups/:id/payment-info')
export class PaymentInfoController {
  constructor(private readonly paymentInfo: PaymentInfoService) {}

  @Put()
  // El límite de multer corta la lectura (413); el servicio revisa también el tipo real.
  @UseInterceptors(FileInterceptor('qr', { limits: { fileSize: MAX_QR_BYTES, files: 1 } }))
  @ApiOperation({ summary: 'Configurar texto y QR de pago (RF-001-20)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        text: { type: 'string', maxLength: 500 },
        qr: { type: 'string', format: 'binary', description: 'JPG o PNG, máximo 2 MB.' },
        removeQr: { type: 'boolean' },
      },
    },
  })
  @ApiUnprocessableEntityResponse({ description: 'GROUP_CLOSED o GROUP_FROZEN.' })
  update(
    @Param('id') groupId: string,
    @Body() body: PaymentInfoDto,
    @UploadedFile() qr: { buffer: Buffer } | undefined,
  ): Promise<{ paymentInfo: PaymentInfoView }> {
    return this.paymentInfo.update(groupId, {
      ...(body.text !== undefined && { text: body.text }),
      ...(qr && { qrBytes: qr.buffer }),
      ...(body.removeQr !== undefined && { removeQr: body.removeQr }),
    });
  }
}

/** Regenerar el código de invitación (spec 001, US2, RF-001-08). Solo el titular. */
@ApiTags('groups')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'UNAUTHENTICATED: sin sesión válida.' })
@ApiNotFoundResponse({ description: 'NOT_FOUND: el grupo no existe o no eres miembro activo.' })
@ApiForbiddenResponse({ description: 'FORBIDDEN: no eres el titular.' })
@UseGuards(AuthGuard, GroupOwnerGuard)
@Controller('groups/:id/invite-code')
export class InviteCodeController {
  constructor(private readonly invites: InviteCodeService) {}

  @Post('regenerate')
  @HttpCode(200)
  @ApiOperation({ summary: 'Regenerar el código; el anterior deja de servir (RF-001-08)' })
  @ApiUnprocessableEntityResponse({ description: 'GROUP_CLOSED o GROUP_FROZEN.' })
  regenerate(@Param('id') groupId: string): Promise<{ inviteCode: string }> {
    return this.invites.regenerate(groupId);
  }
}
