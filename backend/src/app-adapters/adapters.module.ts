import { Global, Module } from '@nestjs/common';
import { HOST_ELIGIBILITY_PORT } from '../modules/subscriptions/ports/host-eligibility.port.js';
import { OPEN_CHARGES_PORT } from '../modules/subscriptions/ports/open-charges.port.js';
import { OWNERSHIP_BLOCKERS_PORT } from '../modules/subscriptions/ports/ownership-blockers.port.js';
import { HostEligibilityAdapter } from './host-eligibility.adapter.js';
import { NoOwnershipBlockersAdapter } from './ownership-blockers.adapter.js';
import { OpenChargesAdapter } from './open-charges.adapter.js';

// Global para que los módulos que definen un puerto lo inyecten sin importar al que lo implementa.
@Global()
@Module({
  providers: [
    HostEligibilityAdapter,
    OpenChargesAdapter,
    NoOwnershipBlockersAdapter,
    { provide: HOST_ELIGIBILITY_PORT, useExisting: HostEligibilityAdapter },
    { provide: OPEN_CHARGES_PORT, useExisting: OpenChargesAdapter },
    { provide: OWNERSHIP_BLOCKERS_PORT, useExisting: NoOwnershipBlockersAdapter },
  ],
  exports: [HOST_ELIGIBILITY_PORT, OPEN_CHARGES_PORT, OWNERSHIP_BLOCKERS_PORT],
})
export class AdaptersModule {}
