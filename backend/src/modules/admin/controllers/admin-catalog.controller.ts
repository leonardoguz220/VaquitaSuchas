import {
  Body,
  Controller,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
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
import type { PlanView, ServiceView } from '../repositories/catalog-admin.repository.js';
import { CatalogAdminService, type WithWarning } from '../services/catalog-admin.service.js';
import { CatalogImportService, type ImportPreview } from '../services/catalog-import.service.js';
import { ImportApplyDto, ImportPreviewDto } from './admin-catalog.dto.js';

const uuid = (): ParseUUIDPipe => new ParseUUIDPipe({ errorHttpStatusCode: 404 });
type Body_ = Record<string, unknown>;

/** Escritura del catálogo para administradores (RF-009-04 a 07); reemplaza las rutas reservadas de la spec 004. */
@ApiTags('admin-catalog')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'UNAUTHENTICATED: sin sesión válida.' })
@ApiForbiddenResponse({ description: 'FORBIDDEN: solo administradores (CA-004-10).' })
@UseGuards(AuthGuard, AdminGuard)
@Controller('admin/catalog')
export class AdminCatalogController {
  constructor(
    private readonly catalog: CatalogAdminService,
    private readonly importer: CatalogImportService,
  ) {}

  @Post('services')
  @ApiOperation({ summary: 'Crea un servicio (RF-009-04)' })
  createService(@Req() req: AuthenticatedRequest, @Body() body: Body_): Promise<ServiceView> {
    return this.catalog.createService(requireUserId(req), body);
  }

  @Patch('services/:id')
  @ApiOperation({ summary: 'Edita un servicio (RF-009-05)' })
  @ApiNotFoundResponse({ description: 'NOT_FOUND' })
  updateService(
    @Req() req: AuthenticatedRequest,
    @Param('id', uuid()) id: string,
    @Body() body: Body_,
  ): Promise<WithWarning<ServiceView>> {
    return this.catalog.updateService(requireUserId(req), id, body);
  }

  @Post('services/:id/activate')
  @HttpCode(200)
  @ApiOperation({ summary: 'Activa un servicio' })
  activateService(
    @Req() req: AuthenticatedRequest,
    @Param('id', uuid()) id: string,
  ): Promise<ServiceView> {
    return this.catalog.setServiceActive(requireUserId(req), id, true);
  }

  @Post('services/:id/deactivate')
  @HttpCode(200)
  @ApiOperation({ summary: 'Desactiva un servicio' })
  deactivateService(
    @Req() req: AuthenticatedRequest,
    @Param('id', uuid()) id: string,
  ): Promise<ServiceView> {
    return this.catalog.setServiceActive(requireUserId(req), id, false);
  }

  @Post('plans')
  @ApiOperation({ summary: 'Crea un plan de un servicio (RF-009-04)' })
  createPlan(@Req() req: AuthenticatedRequest, @Body() body: Body_): Promise<PlanView> {
    return this.catalog.createPlan(requireUserId(req), body);
  }

  @Patch('plans/:id')
  @ApiOperation({ summary: 'Edita un plan; avisa si cambia precios o cupos (RF-009-05)' })
  updatePlan(
    @Req() req: AuthenticatedRequest,
    @Param('id', uuid()) id: string,
    @Body() body: Body_,
  ): Promise<WithWarning<PlanView>> {
    return this.catalog.updatePlan(requireUserId(req), id, body);
  }

  @Post('plans/:id/activate')
  @HttpCode(200)
  @ApiOperation({ summary: 'Activa un plan' })
  activatePlan(
    @Req() req: AuthenticatedRequest,
    @Param('id', uuid()) id: string,
  ): Promise<PlanView> {
    return this.catalog.setPlanActive(requireUserId(req), id, true);
  }

  @Post('plans/:id/deactivate')
  @HttpCode(200)
  @ApiOperation({ summary: 'Desactiva un plan: deja de ofrecerse (RF-009-07)' })
  deactivatePlan(
    @Req() req: AuthenticatedRequest,
    @Param('id', uuid()) id: string,
  ): Promise<PlanView> {
    return this.catalog.setPlanActive(requireUserId(req), id, false);
  }

  @Post('import/preview')
  @HttpCode(200)
  @ApiOperation({ summary: 'Valida un CSV o JSON y entrega un token de 15 minutos (RF-009-06)' })
  preview(
    @Req() req: AuthenticatedRequest,
    @Body() body: ImportPreviewDto,
  ): Promise<ImportPreview> {
    return this.importer.preview(requireUserId(req), body.format, body.content);
  }

  @Post('import/apply')
  @HttpCode(200)
  @ApiOperation({ summary: 'Aplica la importación validada, todo o nada (RF-009-06)' })
  apply(
    @Req() req: AuthenticatedRequest,
    @Body() body: ImportApplyDto,
  ): Promise<{ created: number; updated: number }> {
    return this.importer.apply(requireUserId(req), body.token);
  }
}
