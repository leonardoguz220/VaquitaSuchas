import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AdminAuditController } from './controllers/admin-audit.controller.js';
import { AuditRepository } from './repositories/audit.repository.js';
import { BansRepository } from './repositories/bans.repository.js';
import { HostEnablementsRepository } from './repositories/host-enablements.repository.js';
import { SuspensionsRepository } from './repositories/suspensions.repository.js';
import { AuditService } from './services/audit.service.js';

// DbService, Clock y TxEventBus llegan de módulos globales; AuthModule aporta AUTH_SESSION_PORT
// para AuthGuard. `AuditService` implementa `AuditPort` (lo enlaza `app-adapters`).
@Module({
  imports: [AuthModule],
  controllers: [AdminAuditController],
  providers: [
    AuditRepository,
    BansRepository,
    HostEnablementsRepository,
    SuspensionsRepository,
    AuditService,
  ],
  exports: [
    AuditService,
    AuditRepository,
    BansRepository,
    HostEnablementsRepository,
    SuspensionsRepository,
  ],
})
export class AdminModule {}
