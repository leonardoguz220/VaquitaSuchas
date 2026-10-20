import {
  Body,
  Controller,
  Get,
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
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AdminGuard } from '../../../shared/guards/admin.guard.js';
import { AuthGuard } from '../../../shared/guards/auth.guard.js';
import type { AuthenticatedRequest } from '../../../shared/guards/authenticated-request.js';
import { requireUserId } from '../../../shared/http/request-user.js';
import type { ModerationQueueItem } from '../repositories/listings-moderation.repository.js';
import {
  ListingsModerationService,
  type ModerationResult,
} from '../services/listings-moderation.service.js';
import { ReasonDto } from './admin-users.dto.js';

const uuid = (): ParseUUIDPipe => new ParseUUIDPipe({ errorHttpStatusCode: 404 });

/** Moderación de publicaciones de cupos (RF-009-12 a 14; CA-009-14, 15). */
@ApiTags('admin')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'UNAUTHENTICATED: sin sesión válida.' })
@ApiForbiddenResponse({ description: 'FORBIDDEN: la persona no es administradora.' })
@UseGuards(AuthGuard, AdminGuard)
@Controller('admin/listings')
export class AdminListingsController {
  constructor(private readonly moderation: ListingsModerationService) {}

  @Get('reports')
  @ApiOperation({ summary: 'Cola de publicaciones reportadas u ocultas, con motivos' })
  queue(): Promise<{ items: ModerationQueueItem[] }> {
    return this.moderation.queue();
  }

  @Post(':id/restore')
  @HttpCode(200)
  @ApiOperation({ summary: 'Restaura una publicación oculta, con motivo' })
  @ApiNotFoundResponse({ description: 'NOT_FOUND' })
  restore(
    @Req() req: AuthenticatedRequest,
    @Param('id', uuid()) id: string,
    @Body() body: ReasonDto,
  ): Promise<ModerationResult> {
    return this.moderation.decide(requireUserId(req), id, 'restore', body.reason);
  }

  @Post(':id/delete')
  @HttpCode(200)
  @ApiOperation({ summary: 'Elimina (cierra) una publicación, con motivo' })
  remove(
    @Req() req: AuthenticatedRequest,
    @Param('id', uuid()) id: string,
    @Body() body: ReasonDto,
  ): Promise<ModerationResult> {
    return this.moderation.decide(requireUserId(req), id, 'delete', body.reason);
  }

  @Post(':id/delete-and-suspend')
  @HttpCode(200)
  @ApiOperation({ summary: 'Elimina la publicación y suspende a su titular, con motivo' })
  removeAndSuspend(
    @Req() req: AuthenticatedRequest,
    @Param('id', uuid()) id: string,
    @Body() body: ReasonDto,
  ): Promise<ModerationResult> {
    return this.moderation.decide(requireUserId(req), id, 'delete-and-suspend', body.reason);
  }
}
