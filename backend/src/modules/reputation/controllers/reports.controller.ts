import { Body, Controller, Header, HttpCode, Param, Post, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { AuthGuard } from '../../../shared/guards/auth.guard.js';
import type { AuthenticatedRequest } from '../../../shared/guards/authenticated-request.js';
import { requireUserId, uuidParam } from '../../../shared/http/request-user.js';
import { ReportsService } from '../services/reports.service.js';
import { ReputationExclusionDto, ReputationReportDto } from './reports.dto.js';

/** Reporte y exclusión de cobros mal calificados (spec 007, US4). */
@ApiTags('reputation')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'UNAUTHENTICATED: sin sesión válida.' })
@ApiForbiddenResponse({ description: 'FORBIDDEN: no es el dueño o el titular.' })
@ApiNotFoundResponse({ description: 'NOT_FOUND: el cobro no existe o es de un grupo ajeno.' })
@UseGuards(AuthGuard)
@Controller('charges/:chargeId')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Post('reputation-report')
  @HttpCode(201)
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'El dueño reporta un cobro que cree mal calificado (RF-007-14)' })
  @ApiUnprocessableEntityResponse({
    description: 'BUSINESS_RULE: CHARGE_ALREADY_EXCLUDED o REPORT_ALREADY_SENT.',
  })
  async report(
    @Req() request: AuthenticatedRequest,
    @Param('chargeId', uuidParam()) chargeId: string,
    @Body() body: ReputationReportDto,
  ): Promise<{ chargeId: string }> {
    await this.reports.report(requireUserId(request), chargeId, body.comment);
    return { chargeId };
  }

  @Post('reputation-exclusion')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'El titular excluye un cobro de la reputación con motivo (RF-007-14)' })
  @ApiUnprocessableEntityResponse({ description: 'BUSINESS_RULE: CHARGE_ALREADY_EXCLUDED.' })
  async exclude(
    @Req() request: AuthenticatedRequest,
    @Param('chargeId', uuidParam()) chargeId: string,
    @Body() body: ReputationExclusionDto,
  ): Promise<{ chargeId: string; excluded: true }> {
    await this.reports.exclude(requireUserId(request), chargeId, body.reason);
    return { chargeId, excluded: true };
  }
}
