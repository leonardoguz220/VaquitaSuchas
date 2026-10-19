import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
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
import { GroupOwnerGuard } from './group-owner.guard.js';
import { CreateGroupDto, QuoteGroupDto } from './groups.dto.js';
import { GroupsService, type HostEligibilityView } from '../services/groups.service.js';
import { MembershipService } from '../services/membership.service.js';
import type { GroupDetail } from '../domain/group-detail.js';

/** Alta de grupos y elegibilidad (spec 001, US1). Solo traduce HTTP. */
@ApiTags('groups')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'UNAUTHENTICATED: sin sesión válida.' })
@UseGuards(AuthGuard)
@Controller()
export class GroupsController {
  constructor(private readonly groups: GroupsService) {}

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
