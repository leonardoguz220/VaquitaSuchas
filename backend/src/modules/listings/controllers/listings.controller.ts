import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { AuthenticatedRequest } from '../../../shared/guards/authenticated-request.js';
import { AuthGuard } from '../../../shared/guards/auth.guard.js';
import { requireUserId, uuidParam } from '../../../shared/http/request-user.js';
import type { ListingsPage, ListingView } from '../services/listing-views.js';
import { ListingsSearchService } from '../services/listings-search.service.js';
import { SearchListingsQueryDto } from './listings.dto.js';

/** Búsqueda y detalle de publicaciones de cupos libres (spec 008). Solo traduce HTTP. */
@ApiTags('listings')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'UNAUTHENTICATED: sin sesión válida.' })
@UseGuards(AuthGuard)
@Controller('listings')
export class ListingsController {
  constructor(private readonly search: ListingsSearchService) {}

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
}
