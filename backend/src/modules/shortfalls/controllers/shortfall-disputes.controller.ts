import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AdminGuard } from '../../../shared/guards/admin.guard.js';
import { AuthGuard } from '../../../shared/guards/auth.guard.js';
import {
  ShortfallDisputesService,
  type DisputedRefundView,
} from '../services/shortfall-disputes.service.js';

/** Devoluciones disputadas del faltante de grupo (spec 011, RF-011-15). Solo administración. */
@ApiTags('admin')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'UNAUTHENTICATED: sin sesión válida.' })
@ApiForbiddenResponse({ description: 'FORBIDDEN: la persona no es administradora.' })
@UseGuards(AuthGuard, AdminGuard)
@Controller('admin/shortfall-disputes')
export class ShortfallDisputesController {
  constructor(private readonly disputes: ShortfallDisputesService) {}

  @Get()
  @ApiOperation({ summary: 'Cola de devoluciones disputadas, las más antiguas primero' })
  list(): Promise<{ items: DisputedRefundView[] }> {
    return this.disputes.list();
  }
}
