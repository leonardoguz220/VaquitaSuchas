import {
  Body,
  Controller,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AdminGuard } from '../../../shared/guards/admin.guard.js';
import { AuthGuard } from '../../../shared/guards/auth.guard.js';
import type { AuthenticatedRequest } from '../../../shared/guards/authenticated-request.js';
import { BanService } from '../services/ban.service.js';
import { UsersAdminService, type AdminUserView } from '../services/users-admin.service.js';
import { ReasonDto } from './admin-users.dto.js';

/** Revisión de un baneo por otro administrador (RF-009-23). */
@ApiTags('admin')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'UNAUTHENTICATED: sin sesión válida.' })
@ApiForbiddenResponse({ description: 'FORBIDDEN: la persona no es administradora.' })
@UseGuards(AuthGuard, AdminGuard)
@Controller('admin/bans')
export class AdminBansController {
  constructor(
    private readonly bans: BanService,
    private readonly users: UsersAdminService,
  ) {}

  @Post(':banId/revoke')
  @HttpCode(200)
  @ApiOperation({ summary: 'Revertir un baneo con motivo (RF-009-23)' })
  async revoke(
    @Req() req: AuthenticatedRequest,
    @Param('banId', ParseUUIDPipe) banId: string,
    @Body() body: ReasonDto,
  ): Promise<{ banId: string; user: AdminUserView }> {
    const { userId } = await this.bans.revoke(req.user!.id, banId, body.reason);
    return { banId, user: await this.users.getDetail(userId) };
  }
}
