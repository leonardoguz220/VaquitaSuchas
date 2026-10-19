import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
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
import { JoinRequestsService, type ListQuery } from '../services/join-requests.service.js';
import type {
  GroupJoinRequestsPage,
  JoinRequestsPage,
  JoinRequestsSummary,
  JoinRequestView,
} from '../services/request-views.js';
import { ListJoinRequestsQueryDto, OpenJoinRequestDto } from './join-requests.dto.js';

const toQuery = (query: ListJoinRequestsQueryDto): ListQuery => ({
  ...(query.role && { role: query.role }),
  ...(query.status && { statuses: query.status }),
  ...(query.groupId && { groupId: query.groupId }),
  ...(query.limit !== undefined && { limit: query.limit }),
  ...(query.cursor && { cursor: query.cursor }),
});

/** Solicitudes de ingreso (spec 010). Solo traduce HTTP: el acceso y las reglas los decide el servicio. */
@ApiTags('join-requests')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'UNAUTHENTICATED: sin sesión válida.' })
@UseGuards(AuthGuard)
@Controller()
export class JoinRequestsController {
  constructor(private readonly service: JoinRequestsService) {}

  @Post('join-requests')
  @ApiOperation({ summary: 'Abrir una solicitud con un código de invitación (RF-010-01)' })
  @ApiCreatedResponse({ description: 'JoinRequest en `abierta`.' })
  @ApiForbiddenResponse({ description: 'ACCOUNT_RESTRICTED: cuenta suspendida o baneada.' })
  @ApiUnprocessableEntityResponse({
    description:
      'INVALID_INVITE_CODE, ENTRY_WINDOW_CLOSED, GROUP_NOT_ACCEPTING, NO_SLOTS_AVAILABLE, ACTIVE_REQUEST_EXISTS, TOO_MANY_ACTIVE_REQUESTS, OPEN_CHARGES_IN_GROUP, ALREADY_MEMBER o GROUP_FROZEN. 429 RATE_LIMITED con 10 códigos inválidos en 15 minutos.',
  })
  open(
    @Req() request: AuthenticatedRequest,
    @Body() body: OpenJoinRequestDto,
  ): Promise<JoinRequestView> {
    return this.service.open(requireUserId(request), body.code);
  }

  @Get('join-requests')
  @ApiOperation({ summary: 'Mis solicitudes y las de mis grupos (RF-010-26)' })
  list(
    @Req() request: AuthenticatedRequest,
    @Query() query: ListJoinRequestsQueryDto,
  ): Promise<JoinRequestsPage> {
    return this.service.list(requireUserId(request), toQuery(query));
  }

  @Get('join-requests/:id')
  @ApiOperation({ summary: 'Detalle con línea de tiempo (RF-010-27)' })
  @ApiForbiddenResponse({ description: 'FORBIDDEN: miembro del grupo que no participa.' })
  @ApiNotFoundResponse({ description: 'NOT_FOUND: la solicitud no existe o es ajena.' })
  get(
    @Req() request: AuthenticatedRequest,
    @Param('id', uuidParam()) id: string,
  ): Promise<JoinRequestView> {
    return this.service.get(requireUserId(request), id);
  }

  @Get('me/join-requests/summary')
  @ApiOperation({ summary: 'Insignias de la barra de navegación' })
  summary(@Req() request: AuthenticatedRequest): Promise<JoinRequestsSummary> {
    return this.service.summary(requireUserId(request));
  }
}

/** Cola de solicitudes del titular dentro del grupo (RF-010-26). */
@ApiTags('join-requests')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'UNAUTHENTICATED: sin sesión válida.' })
@UseGuards(AuthGuard)
@Controller('groups/:groupId/join-requests')
export class HostRequestsController {
  constructor(private readonly service: JoinRequestsService) {}

  @Get()
  @ApiOperation({ summary: 'Cola del titular, de la más antigua a la más reciente' })
  @ApiForbiddenResponse({ description: 'FORBIDDEN: miembro que no es el titular.' })
  @ApiNotFoundResponse({ description: 'NOT_FOUND: grupo inexistente o ajeno.' })
  list(
    @Req() request: AuthenticatedRequest,
    @Param('groupId', uuidParam()) groupId: string,
    @Query() query: ListJoinRequestsQueryDto,
  ): Promise<GroupJoinRequestsPage> {
    return this.service.listForGroup(requireUserId(request), groupId, toQuery(query));
  }
}
