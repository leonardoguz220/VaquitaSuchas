import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { DashboardController } from './controllers/dashboard.controller.js';
import { SUBSCRIPTION_MEMBERSHIP_QUERY } from './ports/subscription-membership-query.port.js';
import { MembershipRepository } from './repositories/membership.repository.js';
import { ReportsRepository } from './repositories/reports.repository.js';
import { DashboardService } from './services/dashboard.service.js';

// DbService y Clock llegan de módulos globales. Solo lee: no hay tablas ni escrituras (spec 006).
@Module({
  imports: [AuthModule],
  controllers: [DashboardController],
  providers: [
    ReportsRepository,
    MembershipRepository,
    { provide: SUBSCRIPTION_MEMBERSHIP_QUERY, useExisting: MembershipRepository },
    DashboardService,
  ],
  exports: [DashboardService, ReportsRepository],
})
export class ReportsModule {}
