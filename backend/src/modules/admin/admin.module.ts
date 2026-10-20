import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { UsersModule } from '../users/users.module.js';
import { AdminBansController } from './controllers/admin-bans.controller.js';
import { AdminUsersController } from './controllers/admin-users.controller.js';
import { AdminAuditController } from './controllers/admin-audit.controller.js';
import { AuditRepository } from './repositories/audit.repository.js';
import { BansRepository } from './repositories/bans.repository.js';
import { HostEnablementsRepository } from './repositories/host-enablements.repository.js';
import { SuspensionsRepository } from './repositories/suspensions.repository.js';
import { UsersAdminRepository } from './repositories/users-admin.repository.js';
import { AuditService } from './services/audit.service.js';
import { BanService } from './services/ban.service.js';
import { UsersAdminService } from './services/users-admin.service.js';

// DbService, Clock y TxEventBus llegan de módulos globales; AuthModule aporta AUTH_SESSION_PORT
// para AuthGuard y MailOutbox. `AuditService` implementa `AuditPort` y `BanService` `BanPort` (los
// enlaza `app-adapters`, que también aporta los puertos de conteos y calificación).
@Module({
  imports: [AuthModule, UsersModule],
  controllers: [AdminAuditController, AdminUsersController, AdminBansController],
  providers: [
    AuditRepository,
    BansRepository,
    HostEnablementsRepository,
    SuspensionsRepository,
    UsersAdminRepository,
    AuditService,
    UsersAdminService,
    BanService,
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
