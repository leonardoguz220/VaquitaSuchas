import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { AuthModule } from '../auth/auth.module.js';
import { CalendarController } from './controllers/calendar.controller.js';
import { CollectionController } from './controllers/collection.controller.js';
import { ExportController } from './controllers/export.controller.js';
import { HistoryController } from './controllers/history.controller.js';
import { DashboardController } from './controllers/dashboard.controller.js';
import { SUBSCRIPTION_MEMBERSHIP_QUERY } from './ports/subscription-membership-query.port.js';
import { MembershipRepository } from './repositories/membership.repository.js';
import { ExportLimitRepository } from './repositories/export-limit.repository.js';
import { ReportsRepository } from './repositories/reports.repository.js';
import { CalendarService } from './services/calendar.service.js';
import { ChartsService } from './services/charts.service.js';
import { ExportService } from './services/export.service.js';
import { HistoryService } from './services/history.service.js';
import { DashboardService } from './services/dashboard.service.js';

/** RNF-006-02: también las respuestas de error (400–429) llevan `no-store`; el middleware corre antes que los guards. */
function noStore(_request: Request, response: Response, next: NextFunction): void {
  response.setHeader('Cache-Control', 'private, no-store');
  next();
}

// DbService y Clock llegan de módulos globales. Solo lee: no hay tablas ni escrituras (spec 006).
@Module({
  imports: [AuthModule],
  controllers: [
    DashboardController,
    CollectionController,
    CalendarController,
    HistoryController,
    ExportController,
  ],
  providers: [
    ReportsRepository,
    MembershipRepository,
    { provide: SUBSCRIPTION_MEMBERSHIP_QUERY, useExisting: MembershipRepository },
    DashboardService,
    ChartsService,
    HistoryService,
    ExportService,
    ExportLimitRepository,
    CalendarService,
  ],
  exports: [DashboardService, ReportsRepository],
})
export class ReportsModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(noStore)
      .forRoutes(
        DashboardController,
        CollectionController,
        CalendarController,
        HistoryController,
        ExportController,
      );
  }
}
