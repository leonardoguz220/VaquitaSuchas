import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { UsersModule } from '../users/users.module.js';
import { AdminBansController } from './controllers/admin-bans.controller.js';
import { AdminCatalogController } from './controllers/admin-catalog.controller.js';
import { AdminListingsController } from './controllers/admin-listings.controller.js';
import { AdminStatsController } from './controllers/admin-stats.controller.js';
import { AdminHostsController } from './controllers/admin-hosts.controller.js';
import { AdminUsersController } from './controllers/admin-users.controller.js';
import { AdminAuditController } from './controllers/admin-audit.controller.js';
import { CatalogAdminRepository } from './repositories/catalog-admin.repository.js';
import { ListingsModerationRepository } from './repositories/listings-moderation.repository.js';
import { StatsRepository } from './repositories/stats.repository.js';
import { AuditRepository } from './repositories/audit.repository.js';
import { BansRepository } from './repositories/bans.repository.js';
import { HostEnablementsRepository } from './repositories/host-enablements.repository.js';
import { SuspensionsRepository } from './repositories/suspensions.repository.js';
import { UsersAdminRepository } from './repositories/users-admin.repository.js';
import { CatalogAdminService } from './services/catalog-admin.service.js';
import { CatalogImportService } from './services/catalog-import.service.js';
import { ListingsModerationService } from './services/listings-moderation.service.js';
import { StatsService } from './services/stats.service.js';
import { AuditService } from './services/audit.service.js';
import { HostEnablementService } from './services/host-enablement.service.js';
import { BanService } from './services/ban.service.js';
import { UsersAdminService } from './services/users-admin.service.js';

// DbService, Clock y TxEventBus llegan de módulos globales; AuthModule aporta AUTH_SESSION_PORT
// para AuthGuard y MailOutbox. `AuditService` implementa `AuditPort` y `BanService` `BanPort` (los
// enlaza `app-adapters`, que también aporta los puertos de conteos y calificación).
@Module({
  imports: [AuthModule, UsersModule, NotificationsModule],
  controllers: [
    AdminAuditController,
    AdminUsersController,
    AdminBansController,
    AdminHostsController,
    AdminCatalogController,
    AdminStatsController,
    AdminListingsController,
  ],
  providers: [
    AuditRepository,
    BansRepository,
    HostEnablementsRepository,
    SuspensionsRepository,
    UsersAdminRepository,
    CatalogAdminRepository,
    StatsRepository,
    ListingsModerationRepository,
    AuditService,
    CatalogAdminService,
    CatalogImportService,
    StatsService,
    ListingsModerationService,
    UsersAdminService,
    BanService,
    HostEnablementService,
  ],
  exports: [
    AuditService,
    BanService,
    AuditRepository,
    BansRepository,
    HostEnablementsRepository,
    SuspensionsRepository,
  ],
})
export class AdminModule {}
