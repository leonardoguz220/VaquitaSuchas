import { Global, Module } from '@nestjs/common';
import { HOST_ELIGIBILITY_PORT } from '../modules/subscriptions/ports/host-eligibility.port.js';
import { OPEN_CHARGES_PORT } from '../modules/subscriptions/ports/open-charges.port.js';
import { OWNERSHIP_BLOCKERS_PORT } from '../modules/subscriptions/ports/ownership-blockers.port.js';
import { AdminModule } from '../modules/admin/admin.module.js';
import { AuditService } from '../modules/admin/services/audit.service.js';
import { AUDIT_PORT } from '../modules/join-requests/ports/audit.port.js';
import { BAN_PORT } from '../modules/join-requests/ports/ban.port.js';
import { REPUTATION_QUERY_PORT } from '../modules/join-requests/ports/reputation-query.port.js';
import { HostEligibilityAdapter } from './host-eligibility.adapter.js';
import { RequestsRepository } from '../modules/join-requests/repositories/requests.repository.js';
import { JoinRequestOwnershipBlockersAdapter } from './ownership-blockers.adapter.js';
import { OpenChargesAdapter } from './open-charges.adapter.js';
import { NullBanAdapter, NullReputationAdapter } from './null-join-request-ports.adapter.js';

// Global para que los módulos que definen un puerto lo inyecten sin importar al que lo implementa.
@Global()
@Module({
  imports: [AdminModule],
  providers: [
    HostEligibilityAdapter,
    OpenChargesAdapter,
    RequestsRepository,
    JoinRequestOwnershipBlockersAdapter,
    NullBanAdapter,
    NullReputationAdapter,
    { provide: BAN_PORT, useExisting: NullBanAdapter },
    // Spec 009: el registro real reemplaza al adaptador nulo (RF-009-18).
    { provide: AUDIT_PORT, useExisting: AuditService },
    { provide: REPUTATION_QUERY_PORT, useExisting: NullReputationAdapter },
    { provide: HOST_ELIGIBILITY_PORT, useExisting: HostEligibilityAdapter },
    { provide: OPEN_CHARGES_PORT, useExisting: OpenChargesAdapter },
    { provide: OWNERSHIP_BLOCKERS_PORT, useExisting: JoinRequestOwnershipBlockersAdapter },
  ],
  exports: [
    HOST_ELIGIBILITY_PORT,
    OPEN_CHARGES_PORT,
    OWNERSHIP_BLOCKERS_PORT,
    BAN_PORT,
    AUDIT_PORT,
    REPUTATION_QUERY_PORT,
  ],
})
export class AdaptersModule {}
