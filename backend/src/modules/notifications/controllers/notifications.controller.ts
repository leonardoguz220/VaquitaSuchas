import { Controller, Get, HttpCode, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuthGuard } from '../../../shared/guards/auth.guard.js';
import type { AuthenticatedRequest } from '../../../shared/guards/authenticated-request.js';
import { requireUserId, uuidParam } from '../../../shared/http/request-user.js';
import { NotificationService, type NotificationsPage } from '../services/notification.service.js';
import { ListNotificationsQueryDto } from './notifications.dto.js';

/** Centro de notificaciones (spec 005, parte A). Todo trabaja sobre el usuario de la sesión. */
@ApiTags('notifications')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'UNAUTHENTICATED: sin sesión válida.' })
@UseGuards(AuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationService) {}

  @Get()
  @ApiOperation({ summary: 'Mis notificaciones, de la más reciente a la más antigua (RF-005-01)' })
  @ApiOkResponse({ description: '{ items, nextCursor, unreadCount }' })
  list(
    @Req() request: AuthenticatedRequest,
    @Query() query: ListNotificationsQueryDto,
  ): Promise<NotificationsPage> {
    return this.notifications.list(requireUserId(request), query);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Contador de no leídas de la campana (RF-005-02)' })
  @ApiOkResponse({ description: '{ unreadCount }' })
  unreadCount(@Req() request: AuthenticatedRequest): Promise<{ unreadCount: number }> {
    return this.notifications.unreadCount(requireUserId(request));
  }

  // Declarada antes de `:id/read` para que `read-all` no se interprete como un id.
  @Post('read-all')
  @HttpCode(204)
  @ApiOperation({ summary: 'Marca todas mis notificaciones como leídas (CA-005-22)' })
  @ApiNoContentResponse()
  async readAll(@Req() request: AuthenticatedRequest): Promise<void> {
    await this.notifications.markAllRead(requireUserId(request));
  }

  @Post(':id/read')
  @HttpCode(204)
  @ApiOperation({ summary: 'Marca una notificación como leída (CA-005-22)' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'NOT_FOUND: no existe o es de otra persona.' })
  async read(
    @Req() request: AuthenticatedRequest,
    @Param('id', uuidParam()) id: string,
  ): Promise<void> {
    await this.notifications.markRead(requireUserId(request), id);
  }
}
