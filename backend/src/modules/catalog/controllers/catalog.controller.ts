import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuthGuard } from '../../../shared/guards/auth.guard.js';
import {
  CatalogService,
  type CatalogPlanView,
  type CatalogServiceView,
} from '../services/catalog.service.js';
import type { Category } from '../domain/categories.js';
import { ServiceSlugParams } from './catalog.dto.js';

@ApiTags('catalog')
@UseGuards(AuthGuard)
@ApiBearerAuth()
@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('services/:slug')
  @ApiOperation({ summary: 'Detalle de un servicio con sus planes activos (RF-004-05)' })
  @ApiOkResponse({ description: '{ service: CatalogService, plans: CatalogPlan[] } por precio.' })
  @ApiNotFoundResponse({ description: 'NOT_FOUND: no existe, está inactivo o sin planes activos.' })
  @ApiUnauthorizedResponse({ description: 'UNAUTHENTICATED.' })
  getService(
    @Param() params: ServiceSlugParams,
  ): Promise<{ service: CatalogServiceView; plans: CatalogPlanView[] }> {
    return this.catalog.getService(params.slug);
  }

  @Get('categories')
  @ApiOperation({ summary: 'Las seis categorías con su cantidad de servicios (RF-004-03)' })
  @ApiOkResponse({ description: '{ items: [{ value, label, servicesCount }] }' })
  @ApiUnauthorizedResponse({ description: 'UNAUTHENTICATED.' })
  listCategories(): Promise<{
    items: { value: Category; label: string; servicesCount: number }[];
  }> {
    return this.catalog.listCategories();
  }
}
