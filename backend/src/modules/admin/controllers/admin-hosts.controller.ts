import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
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
import {
  HostEnablementService,
  type HostEnablementView,
} from '../services/host-enablement.service.js';
import { ListHostEnablementsQueryDto } from './admin-hosts.dto.js';
import { ReasonDto } from './admin-users.dto.js';

/** Habilitación manual de titulares (RF-009-21; CA-009-28). */
@ApiTags('admin')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'UNAUTHENTICATED: sin sesión válida.' })
@ApiForbiddenResponse({ description: 'FORBIDDEN: la persona no es administradora.' })
@UseGuards(AuthGuard, AdminGuard)
@Controller('admin')
export class AdminHostsController {
  constructor(private readonly hosts: HostEnablementService) {}

  @Get('host-enablements')
  @ApiOperation({ summary: 'Habilitaciones manuales de titular (vigentes por omisión)' })
  list(@Query() query: ListHostEnablementsQueryDto): Promise<{ items: HostEnablementView[] }> {
    return this.hosts.list(query.active !== false);
  }

  @Post('users/:userId/host-enablement')
  @HttpCode(200)
  @ApiOperation({ summary: 'Habilitar manualmente como titular, con motivo (RF-009-21)' })
  enable(
    @Req() req: AuthenticatedRequest,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() body: ReasonDto,
  ): Promise<HostEnablementView> {
    return this.hosts.enable(req.user!.id, userId, body.reason);
  }

  @Post('users/:userId/host-enablement/revoke')
  @HttpCode(200)
  @ApiOperation({ summary: 'Quitar la habilitación manual, con motivo (RF-009-21)' })
  revoke(
    @Req() req: AuthenticatedRequest,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() body: ReasonDto,
  ): Promise<HostEnablementView> {
    return this.hosts.revoke(req.user!.id, userId, body.reason);
  }
}
