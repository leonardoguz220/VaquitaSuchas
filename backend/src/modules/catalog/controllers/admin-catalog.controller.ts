import { Controller, Patch, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { DomainError } from '../../../shared/errors/domain-error.js';
import { AdminGuard } from '../../../shared/guards/admin.guard.js';
import { AuthGuard } from '../../../shared/guards/auth.guard.js';

function notImplemented(): never {
  throw new DomainError('NOT_IMPLEMENTED', 501, 'Esta función estará disponible más adelante.');
}

/** Rutas reservadas para que el permiso quede probado desde el MVP; la spec 009 las implementa. */
@ApiTags('admin-catalog')
@UseGuards(AuthGuard, AdminGuard)
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'UNAUTHENTICATED.' })
@ApiForbiddenResponse({ description: 'FORBIDDEN: solo administradores (CA-004-10).' })
@ApiResponse({ status: 501, description: 'NOT_IMPLEMENTED hasta la spec 009.' })
@Controller('admin/catalog')
export class AdminCatalogController {
  @Post('services')
  @ApiOperation({ summary: 'Reservada: crear servicio (spec 009)' })
  createService(): never {
    return notImplemented();
  }

  @Patch('services/:slug')
  @ApiOperation({ summary: 'Reservada: editar o (des)activar servicio (spec 009)' })
  updateService(): never {
    return notImplemented();
  }

  @Post('services/:slug/plans')
  @ApiOperation({ summary: 'Reservada: crear plan (spec 009)' })
  createPlan(): never {
    return notImplemented();
  }

  @Patch('plans/:slug')
  @ApiOperation({ summary: 'Reservada: editar o (des)activar plan (spec 009)' })
  updatePlan(): never {
    return notImplemented();
  }
}
