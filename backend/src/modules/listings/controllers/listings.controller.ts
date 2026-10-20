import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import type { AuthenticatedRequest } from '../../../shared/guards/authenticated-request.js';
import { AuthGuard } from '../../../shared/guards/auth.guard.js';
import { requireUserId, uuidParam } from '../../../shared/http/request-user.js';
import type { JoinRequestView } from '../../join-requests/services/request-views.js';
import type { ListingsPage, ListingView } from '../services/listing-views.js';
import { ListingsSearchService } from '../services/listings-search.service.js';
import { ListingsService } from '../services/listings.service.js';
import { RequestSeatDto, SearchListingsQueryDto } from './listings.dto.js';

/** Búsqueda y detalle de publicaciones de cupos libres (spec 008). Solo traduce HTTP. */
@ApiTags('listings')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'UNAUTHENTICATED: sin sesión válida.' })
@UseGuards(AuthGuard)
@Controller('listings')
export class ListingsController {
  constructor(
    private readonly search: ListingsSearchService,
    private readonly service: ListingsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Buscar cupos libres (RF-008-07 a 09)' })
  @ApiOkResponse({ description: '`{ items: ListingView[], nextCursor }`.' })
  list(
    @Req() request: AuthenticatedRequest,
    @Query() query: SearchListingsQueryDto,
  ): Promise<ListingsPage> {
    return this.search.list(requireUserId(request), query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Ver una publicación (RF-008-03)' })
  @ApiOkResponse({ description: '`ListingView`.' })
  @ApiNotFoundResponse({
    description:
      'LISTING_NOT_FOUND: inexistente, no activa, propia o de un grupo donde ya es miembro.',
  })
  getOne(
    @Req() request: AuthenticatedRequest,
    @Param('id', uuidParam()) id: string,
  ): Promise<ListingView> {
    return this.search.getOne(requireUserId(request), id);
  }

  @Post(':id/requests')
  @ApiOperation({ summary: 'Solicitar un cupo de la publicación (RF-008-10)' })
  @ApiCreatedResponse({ description: '`JoinRequest` (spec 010) en `abierta`.' })
  @ApiNotFoundResponse({ description: 'LISTING_NOT_FOUND.' })
  @ApiForbiddenResponse({ description: 'ACCOUNT_RESTRICTED: cuenta suspendida o baneada.' })
  @ApiUnprocessableEntityResponse({
    description:
      'ENTRY_WINDOW_CLOSED, ACTIVE_REQUEST_EXISTS, TOO_MANY_ACTIVE_REQUESTS, OPEN_CHARGES_IN_GROUP o NO_SLOTS_AVAILABLE.',
  })
  requestSeat(
    @Req() request: AuthenticatedRequest,
    @Param('id', uuidParam()) id: string,
    @Body() body: RequestSeatDto,
  ): Promise<JoinRequestView> {
    return this.service.requestSeat(requireUserId(request), id, body.message);
  }
}
