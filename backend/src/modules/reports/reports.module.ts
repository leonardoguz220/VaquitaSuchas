import { Module } from '@nestjs/common';
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
export class ReportsModule {}
