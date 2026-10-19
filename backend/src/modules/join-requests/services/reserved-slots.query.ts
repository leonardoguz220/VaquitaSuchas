import { Injectable } from '@nestjs/common';
import type { Queryable } from '../../../shared/db/db.service.js';
import { RequestsRepository } from '../repositories/requests.repository.js';

/** Cupos reservados por solicitudes en pago con plazo vigente (RN-010-02); lo consume la spec 008. */
@Injectable()
export class ReservedSlotsQuery {
  constructor(private readonly requests: RequestsRepository) {}

  count(q: Queryable, groupId: string, now: Date): Promise<number> {
    return this.requests.countReserved(q, groupId, now);
  }
}
