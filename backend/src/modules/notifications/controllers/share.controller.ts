import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { AuthGuard } from '../../../shared/guards/auth.guard.js';
import type { AuthenticatedRequest } from '../../../shared/guards/authenticated-request.js';
import { requireUserId } from '../../../shared/http/request-user.js';
import { GroupOwnerGuard } from '../../subscriptions/controllers/group-owner.guard.js';
import { ShareService } from '../services/share.service.js';

/** Textos prellenados para WhatsApp (spec 005, RF-005-15 y RF-005-16). El servidor no envía nada. */
@ApiTags('notifications')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'UNAUTHENTICATED: sin sesión válida.' })
@ApiNotFoundResponse({ description: 'NOT_FOUND: recurso inexistente o ajeno.' })
@ApiForbiddenResponse({ description: 'FORBIDDEN: no eres el titular.' })
@Controller()
export class ShareController {
  constructor(private readonly share: ShareService) {}

  @Get('groups/:id/invitation-share')
  @UseGuards(AuthGuard, GroupOwnerGuard)
  @ApiOperation({ summary: 'Enlace y texto de invitación para WhatsApp (RF-005-15)' })
  @ApiOkResponse({ description: '{ inviteUrl, text }' })
  invitationShare(@Param('id') groupId: string): Promise<{ inviteUrl: string; text: string }> {
    return this.share.invitationShare(groupId);
  }

  @Get('charges/:chargeId/reminder-share')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Teléfono y texto del recordatorio de cobro (RF-005-16)' })
  @ApiOkResponse({ description: '{ phone, text }' })
  @ApiUnprocessableEntityResponse({ description: 'BUSINESS_RULE: CHARGE_NOT_COLLECTABLE.' })
  reminderShare(
    @Req() request: AuthenticatedRequest,
    @Param('chargeId') chargeId: string,
  ): Promise<{ phone: string; text: string }> {
    return this.share.reminderShare(requireUserId(request), chargeId);
  }
}
