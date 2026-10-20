import { Body, Controller, Get, HttpCode, Post, Put, Req, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuthGuard } from '../../../shared/guards/auth.guard.js';
import type { AuthenticatedRequest } from '../../../shared/guards/authenticated-request.js';
import { requireUserId } from '../../../shared/http/request-user.js';
import type { NotificationCategory } from '../domain/catalog.js';
import { PreferencesService, type PreferencesView } from '../services/preferences.service.js';
import { UnsubscribeDto, UpdatePreferencesDto } from './preferences.dto.js';

/** Preferencias de aviso y desactivación desde el correo (spec 005, parte B). */
@ApiTags('notifications')
@Controller()
export class PreferencesController {
  constructor(private readonly preferences: PreferencesService) {}

  @Get('notification-preferences')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'UNAUTHENTICATED: sin sesión válida.' })
  @ApiOperation({ summary: 'Mis interruptores de correo y Telegram por categoría (RF-005-17)' })
  @ApiOkResponse({
    description: '{ email, telegram (con blocked), emailProblem, securityEmailsAlwaysOn }',
  })
  get(@Req() request: AuthenticatedRequest): Promise<PreferencesView> {
    return this.preferences.get(requireUserId(request));
  }

  @Put('notification-preferences')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'UNAUTHENTICATED: sin sesión válida.' })
  @ApiOperation({ summary: 'Cambia interruptores de correo y Telegram (RF-005-17; CA-005-11)' })
  @ApiOkResponse({ description: 'Preferencias resultantes.' })
  update(
    @Req() request: AuthenticatedRequest,
    @Body() body: UpdatePreferencesDto,
  ): Promise<PreferencesView> {
    return this.preferences.update(requireUserId(request), {
      email: body.email,
      telegram: body.telegram,
    });
  }

  /** Pública: el token firmado identifica al usuario, la categoría y el canal (CA-005-13). */
  @Post('notifications/unsubscribe')
  @HttpCode(200)
  @ApiOperation({ summary: 'Desactiva un tipo de correo con el token del enlace (RF-005-18)' })
  @ApiOkResponse({ description: '{ category }' })
  @ApiBadRequestResponse({ description: 'VALIDATION_ERROR: token inválido.' })
  unsubscribe(@Body() body: UnsubscribeDto): Promise<{ category: NotificationCategory }> {
    return this.preferences.unsubscribe(body.token);
  }
}
