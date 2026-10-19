import { Injectable } from '@nestjs/common';
import { Clock } from '../shared/clock/clock.js';
import type { Queryable } from '../shared/db/db.service.js';
import { RequestsRepository } from '../modules/join-requests/repositories/requests.repository.js';
import type { OwnershipBlockersPort } from '../modules/subscriptions/ports/ownership-blockers.port.js';

/** Motivo que se informa cuando hay solicitudes de ingreso en pago (RN-010-09, CA-010-33). */
export const JOIN_REQUESTS_IN_PAYMENT = 'join_requests_in_payment';

/**
 * Adaptador real de `OwnershipBlockersPort` (spec 001) implementado por la spec 010: un grupo con
 * solicitudes en `esperando_pago` o `pago_informado` con plazo vigente no se transfiere ni se
 * cierra. Una solicitud en pago cuyo plazo ya venció se evalúa `expirada` y no bloquea.
 */
@Injectable()
export class JoinRequestOwnershipBlockersAdapter implements OwnershipBlockersPort {
  constructor(
    private readonly requests: RequestsRepository,
    private readonly clock: Clock,
  ) {}

  async blockers(q: Queryable, groupId: string): Promise<string[]> {
    return (await this.requests.hasPayingRequests(q, groupId, this.clock.now()))
      ? [JOIN_REQUESTS_IN_PAYMENT]
      : [];
  }
}
