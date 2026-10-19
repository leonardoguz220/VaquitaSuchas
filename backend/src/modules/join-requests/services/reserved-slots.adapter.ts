import { Injectable } from '@nestjs/common';
import type { Queryable } from '../../../shared/db/db.service.js';
import type { ReservedSlotsQuery } from '../ports/reserved-slots.query.js';
import { RequestsRepository } from '../repositories/requests.repository.js';

/** Implementación de `ReservedSlotsQuery` (RN-010-02) sobre `join_requests`. */
@Injectable()
export class ReservedSlotsAdapter implements ReservedSlotsQuery {
  constructor(private readonly requests: RequestsRepository) {}

  count(q: Queryable, groupId: string, now: Date): Promise<number> {
    return this.requests.countReserved(q, groupId, now);
  }
}
