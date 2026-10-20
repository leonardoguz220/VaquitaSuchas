import { once } from 'node:events';
import { Controller, Get, Param, Query, Req, Res, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { AuthGuard } from '../../../shared/guards/auth.guard.js';
import type { AuthenticatedRequest } from '../../../shared/guards/authenticated-request.js';
import { requireUserId, uuidParam } from '../../../shared/http/request-user.js';
import { ExportService, type CsvExport } from '../services/export.service.js';
import { GroupExportQueryDto, HistoryQueryDto } from './dashboard.dto.js';

/** Escribe el CSV en flujo; los errores ocurren antes de este punto y los traduce el filtro global. */
async function sendCsv(response: Response, csv: CsvExport): Promise<void> {
  response.set({
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${csv.filename}"`,
    'Cache-Control': 'private, no-store',
  });
  try {
    for await (const chunk of csv.chunks) {
      if (!response.write(chunk)) await once(response, 'drain');
    }
    response.end();
  } catch {
    // Ya se enviaron las cabeceras: se corta la conexión para que el cliente no tome el archivo por completo.
    response.destroy();
  }
}

/** Exportaciones a CSV del historial (spec 006, US5). */
@ApiTags('reports')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'UNAUTHENTICATED: sin sesión válida.' })
@UseGuards(AuthGuard)
@Controller()
export class ExportController {
  constructor(private readonly exports: ExportService) {}

  @Get('me/history/export.csv')
  @ApiOperation({ summary: 'Exporta mi historial a CSV (RF-006-14, 15)' })
  async exportOwn(
    @Req() request: AuthenticatedRequest,
    @Query() query: HistoryQueryDto,
    @Res() response: Response,
  ): Promise<void> {
    const csv = await this.exports.exportOwn(requireUserId(request), {
      period: query.period ?? null,
      groupId: query.groupId ?? null,
      statuses: query.status ?? [],
    });
    await sendCsv(response, csv);
  }

  @Get('groups/:groupId/history/export.csv')
  @ApiOperation({ summary: 'Exporta el historial del grupo a CSV, solo el titular (RF-006-14)' })
  @ApiForbiddenResponse({ description: 'FORBIDDEN: un miembro que no es titular.' })
  @ApiNotFoundResponse({ description: 'NOT_FOUND: grupo ajeno.' })
  async exportGroup(
    @Req() request: AuthenticatedRequest,
    @Param('groupId', uuidParam()) groupId: string,
    @Query() query: GroupExportQueryDto,
    @Res() response: Response,
  ): Promise<void> {
    const csv = await this.exports.exportGroup(requireUserId(request), groupId, {
      period: query.period ?? null,
      userId: query.userId ?? null,
      statuses: query.status ?? [],
    });
    await sendCsv(response, csv);
  }
}
