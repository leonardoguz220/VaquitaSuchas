import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
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
  type CatalogPage,
  type CatalogPlanView,
  type CatalogServiceView,
} from '../services/catalog.service.js';
import type { Category } from '../domain/categories.js';
import { ListServicesQuery, ServiceSlugParams } from './catalog.dto.js';

@ApiTags('catalog')
@UseGuards(AuthGuard)
@ApiBearerAuth()
@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('services')
  @ApiOperation({ summary: 'Lista servicios ofrecidos con filtro y búsqueda (RF-004-04)' })
  @ApiOkResponse({ description: '{ items: CatalogService[], nextCursor }' })
  @ApiBadRequestResponse({ description: 'VALIDATION_ERROR: categoría, q, limit o cursor.' })
  @ApiUnauthorizedResponse({ description: 'UNAUTHENTICATED.' })
  listServices(@Query() query: ListServicesQuery): Promise<CatalogPage> {
    return this.catalog.listServices(query);
  }

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
