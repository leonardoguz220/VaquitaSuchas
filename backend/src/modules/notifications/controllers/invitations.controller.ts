import { Body, Controller, HttpCode, Param, Post, Req, UseGuards } from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { AuthGuard } from '../../../shared/guards/auth.guard.js';
import type { AuthenticatedRequest } from '../../../shared/guards/authenticated-request.js';
import { requireUserId } from '../../../shared/http/request-user.js';
import { GroupOwnerGuard } from '../../subscriptions/controllers/group-owner.guard.js';
import { InvitationsService } from '../services/invitations.service.js';
import { InviteByEmailDto } from './invitations.dto.js';

/** Invitación por correo (spec 005, RF-005-14). Solo el titular. */
@ApiTags('notifications')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'UNAUTHENTICATED: sin sesión válida.' })
@ApiNotFoundResponse({ description: 'NOT_FOUND: el grupo no existe o no eres miembro activo.' })
@ApiForbiddenResponse({ description: 'FORBIDDEN: no eres el titular.' })
@UseGuards(AuthGuard, GroupOwnerGuard)
@Controller('groups/:id/invitations')
export class InvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  @Post()
  @HttpCode(202)
  @ApiOperation({ summary: 'Invita por correo; 10 por hora por titular (RF-005-14)' })
  @ApiAcceptedResponse({
    description: '{ status: "pendiente" }. No revela si el correo ya es del grupo.',
  })
  @ApiBadRequestResponse({ description: 'VALIDATION_ERROR: correo inválido.' })
  @ApiResponse({ status: 429, description: 'RATE_LIMITED con details.retryAfterSeconds.' })
  @ApiUnprocessableEntityResponse({ description: 'GROUP_CLOSED o GROUP_FROZEN.' })
  invite(
    @Req() request: AuthenticatedRequest,
    @Param('id') groupId: string,
    @Body() body: InviteByEmailDto,
  ): Promise<{ status: 'pendiente' }> {
    return this.invitations.invite(requireUserId(request), groupId, body.email);
  }
}
