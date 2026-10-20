import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AdminGuard } from '../../../shared/guards/admin.guard.js';
import { AuthGuard } from '../../../shared/guards/auth.guard.js';
import { AuditService, type AuditPage } from '../services/audit.service.js';
import { ListAuditLogQueryDto } from './admin-audit.dto.js';

/**
 * Log de auditoría (spec 009, RF-009-18). Solo lectura: no existen PUT, PATCH ni DELETE
 * (CA-009-19). El rol `admin` se verifica en el servidor en cada petición (RNF-009-01).
 */
@ApiTags('admin')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'UNAUTHENTICATED: sin sesión válida.' })
@ApiForbiddenResponse({ description: 'FORBIDDEN: la persona no es administradora.' })
@UseGuards(AuthGuard, AdminGuard)
@Controller('admin/audit-log')
export class AdminAuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @ApiOperation({ summary: 'Log de auditoría con filtros y paginación (RF-009-18)' })
  list(@Query() query: ListAuditLogQueryDto): Promise<AuditPage> {
    return this.audit.list(query);
  }
}
