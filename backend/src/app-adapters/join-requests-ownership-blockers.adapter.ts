import { Injectable } from '@nestjs/common';
import { Clock } from '../shared/clock/clock.js';
import type { Queryable } from '../shared/db/db.service.js';
import { RequestsRepository } from '../modules/join-requests/repositories/requests.repository.js';
import type { OwnershipBlockersPort } from '../modules/subscriptions/ports/ownership-blockers.port.js';

/**
 * `OwnershipBlockersPort` de la spec 001 respaldado por la spec 010 (RN-010-09): mientras el
 * grupo tenga solicitudes en `esperando_pago` o `pago_informado` con plazo vigente, no se puede
 * transferir la titularidad ni cerrar el grupo.
 */
@Injectable()
export class JoinRequestsOwnershipBlockersAdapter implements OwnershipBlockersPort {
  constructor(
    private readonly requests: RequestsRepository,
    private readonly clock: Clock,
  ) {}

  async blockers(q: Queryable, groupId: string): Promise<string[]> {
    const paying = await this.requests.countReserved(q, groupId, this.clock.now());
    return paying > 0 ? ['join_requests_in_payment'] : [];
  }
}
