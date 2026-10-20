import { Body, Controller, HttpCode, Param, Post, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { AdminGuard } from '../../../shared/guards/admin.guard.js';
import { AuthGuard } from '../../../shared/guards/auth.guard.js';
import type { AuthenticatedRequest } from '../../../shared/guards/authenticated-request.js';
import { requireUserId, uuidParam } from '../../../shared/http/request-user.js';
import { requireReason } from '../../admin/services/admin-errors.js';
import { MembershipService } from '../services/membership.service.js';
import { AdminTransferOwnershipDto } from './groups.dto.js';

/**
 * Transferencia de titularidad por administración (RF-009-24; CA-009-35). Vive en `subscriptions`
 * (como `/admin/disputes/*` en `join-requests`) para no crear un ciclo entre módulos.
 */
@ApiTags('admin')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'UNAUTHENTICATED: sin sesión válida.' })
@ApiForbiddenResponse({ description: 'FORBIDDEN: la persona no es administradora.' })
@ApiNotFoundResponse({ description: 'NOT_FOUND: el grupo no existe.' })
@UseGuards(AuthGuard, AdminGuard)
@Controller('admin/groups')
export class AdminGroupsController {
  constructor(private readonly membership: MembershipService) {}

  @Post(':groupId/transfer-ownership')
  @HttpCode(200)
  @ApiOperation({ summary: 'Transferir la titularidad con el titular suspendido (RF-009-24)' })
  @ApiUnprocessableEntityResponse({
    description:
      'BUSINESS_RULE (RF-009-24, RF-001-17, RN-010-09), NOT_HOST_ELIGIBLE (RF-001-21), TOO_MANY_ACTIVE_GROUPS (RN-001-14).',
  })
  transfer(
    @Req() request: AuthenticatedRequest,
    @Param('groupId', uuidParam()) groupId: string,
    @Body() body: AdminTransferOwnershipDto,
  ): Promise<{ groupId: string; fromUserId: string; toUserId: string }> {
    const reason = requireReason(body.reason);
    return this.membership.transferByAdmin(requireUserId(request), groupId, body.toUserId, reason);
  }
}
