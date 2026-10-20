import { Controller, Get, Header, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { AuthGuard } from '../../../shared/guards/auth.guard.js';
import type { AuthenticatedRequest } from '../../../shared/guards/authenticated-request.js';
import { requireUserId } from '../../../shared/http/request-user.js';
import type { CalendarEvent } from '../domain/calendar-events.js';
import { CalendarService } from '../services/calendar.service.js';
import { CalendarQueryDto, UpcomingQueryDto } from './dashboard.dto.js';

/** Calendario del usuario (spec 006, US4). */
@ApiTags('reports')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'UNAUTHENTICATED: sin sesión válida.' })
@UseGuards(AuthGuard)
@Controller('me/calendar')
export class CalendarController {
  constructor(private readonly calendar: CalendarService) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Cortes y vencimientos del mes (RF-006-11, 12)' })
  month(
    @Req() request: AuthenticatedRequest,
    @Query() query: CalendarQueryDto,
  ): Promise<{ month: string; events: CalendarEvent[] }> {
    return this.calendar.month(requireUserId(request), query.month ?? null);
  }

  @Get('upcoming')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Próximos días (RF-006-11)' })
  upcoming(
    @Req() request: AuthenticatedRequest,
    @Query() query: UpcomingQueryDto,
  ): Promise<{ events: CalendarEvent[] }> {
    return this.calendar.upcoming(requireUserId(request), query.days ?? 30);
  }
}
