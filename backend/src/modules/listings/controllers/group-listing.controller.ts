import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../../shared/guards/authenticated-request.js';
import { AuthGuard } from '../../../shared/guards/auth.guard.js';
import { requireUserId, uuidParam } from '../../../shared/http/request-user.js';
import type { OwnerListing } from '../services/listing-views.js';
import { ListingsService } from '../services/listings.service.js';
import { PublishListingDto, UpdateListingDto } from './listings.dto.js';

/** Publicación de cupos libres de un grupo (spec 008, US1). Solo traduce HTTP. */
@ApiTags('listings')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'UNAUTHENTICATED: sin sesión válida.' })
@ApiNotFoundResponse({ description: 'NOT_FOUND: el grupo no existe o es ajeno.' })
@UseGuards(AuthGuard)
@Controller('groups/:groupId/listing')
export class GroupListingController {
  constructor(private readonly service: ListingsService) {}

  @Post()
  @ApiOperation({ summary: 'Publicar cupos libres (RF-008-01, RF-008-02)' })
  @ApiCreatedResponse({ description: '`OwnerListing` en `activa`, vence en 30 días.' })
  @ApiForbiddenResponse({ description: 'FORBIDDEN (miembro) o ACCOUNT_RESTRICTED.' })
  @ApiConflictResponse({ description: 'LISTING_ALREADY_ACTIVE.' })
  @ApiUnprocessableEntityResponse({
    description: 'NO_FREE_SLOTS, GROUP_NOT_ACCEPTING, GROUP_CLOSED o GROUP_FROZEN.',
  })
  publish(
    @Req() request: AuthenticatedRequest,
    @Param('groupId', uuidParam()) groupId: string,
    @Body() body: PublishListingDto,
  ): Promise<OwnerListing> {
    return this.service.publish(requireUserId(request), groupId, body);
  }

  @Get()
  @ApiOperation({ summary: 'Ver la publicación del grupo (titular) o su resumen (miembro)' })
  @ApiOkResponse({ description: 'Titular: `OwnerListing | null`. Miembro: `GroupListingSummary`.' })
  async get(
    @Req() request: AuthenticatedRequest,
    @Param('groupId', uuidParam()) groupId: string,
    @Res() response: Response,
  ): Promise<void> {
    const result = await this.service.get(requireUserId(request), groupId);
    // `null` debe viajar como JSON (`null`), no como cuerpo vacío.
    response.status(200).json(result);
  }

  @Patch()
  @ApiOperation({ summary: 'Editar cupos, descripción o condiciones (RF-008-06)' })
  @ApiOkResponse({ description: '`OwnerListing`.' })
  @ApiForbiddenResponse({ description: 'FORBIDDEN (miembro) o ACCOUNT_RESTRICTED.' })
  @ApiConflictResponse({ description: 'STALE_STATE.' })
  @ApiUnprocessableEntityResponse({ description: 'NO_FREE_SLOTS y reglas del grupo.' })
  update(
    @Req() request: AuthenticatedRequest,
    @Param('groupId', uuidParam()) groupId: string,
    @Body() body: UpdateListingDto,
  ): Promise<OwnerListing> {
    return this.service.update(requireUserId(request), groupId, body);
  }

  @Post('renew')
  @HttpCode(200)
  @ApiOperation({ summary: 'Renovar 30 días una publicación activa o expirada (RF-008-05)' })
  @ApiOkResponse({ description: '`OwnerListing` en `activa`.' })
  @ApiConflictResponse({ description: 'LISTING_ALREADY_ACTIVE.' })
  @ApiUnprocessableEntityResponse({ description: 'NO_FREE_SLOTS o LISTING_HIDDEN.' })
  renew(
    @Req() request: AuthenticatedRequest,
    @Param('groupId', uuidParam()) groupId: string,
  ): Promise<OwnerListing> {
    return this.service.renew(requireUserId(request), groupId);
  }

  @Delete()
  @HttpCode(204)
  @ApiOperation({ summary: 'Retirar la publicación (RF-008-06)' })
  @ApiNoContentResponse({ description: 'La publicación pasa a `retirada`.' })
  async withdraw(
    @Req() request: AuthenticatedRequest,
    @Param('groupId', uuidParam()) groupId: string,
  ): Promise<void> {
    await this.service.withdraw(requireUserId(request), groupId);
  }
}
