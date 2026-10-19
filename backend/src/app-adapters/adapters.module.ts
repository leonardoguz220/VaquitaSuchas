import { Global, Module } from '@nestjs/common';
import { HOST_ELIGIBILITY_PORT } from '../modules/subscriptions/ports/host-eligibility.port.js';
import { OPEN_CHARGES_PORT } from '../modules/subscriptions/ports/open-charges.port.js';
import { OWNERSHIP_BLOCKERS_PORT } from '../modules/subscriptions/ports/ownership-blockers.port.js';
import { AUDIT_PORT } from '../modules/join-requests/ports/audit.port.js';
import { BAN_PORT } from '../modules/join-requests/ports/ban.port.js';
import { REPUTATION_QUERY_PORT } from '../modules/join-requests/ports/reputation-query.port.js';
import { HostEligibilityAdapter } from './host-eligibility.adapter.js';
import { JoinRequestsOwnershipBlockersAdapter } from './join-requests-ownership-blockers.adapter.js';
import { RequestsRepository } from '../modules/join-requests/repositories/requests.repository.js';
import { OpenChargesAdapter } from './open-charges.adapter.js';
import {
  NullAuditAdapter,
  NullBanAdapter,
  NullReputationAdapter,
} from './null-join-request-ports.adapter.js';

// Global para que los módulos que definen un puerto lo inyecten sin importar al que lo implementa.
@Global()
@Module({
  providers: [
    HostEligibilityAdapter,
    OpenChargesAdapter,
    RequestsRepository,
    JoinRequestsOwnershipBlockersAdapter,
    NullBanAdapter,
    NullAuditAdapter,
    NullReputationAdapter,
    { provide: BAN_PORT, useExisting: NullBanAdapter },
    { provide: AUDIT_PORT, useExisting: NullAuditAdapter },
    { provide: REPUTATION_QUERY_PORT, useExisting: NullReputationAdapter },
    { provide: HOST_ELIGIBILITY_PORT, useExisting: HostEligibilityAdapter },
    { provide: OPEN_CHARGES_PORT, useExisting: OpenChargesAdapter },
    { provide: OWNERSHIP_BLOCKERS_PORT, useExisting: JoinRequestsOwnershipBlockersAdapter },
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
