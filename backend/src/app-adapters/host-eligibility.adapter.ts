import { Injectable } from '@nestjs/common';
import { Clock } from '../shared/clock/clock.js';
import type { Queryable } from '../shared/db/db.service.js';
import {
  HOST_REQUIREMENT,
  type HostEligibility,
  type HostEligibilityPort,
} from '../modules/subscriptions/ports/host-eligibility.port.js';
import { ReputationQueryService } from '../modules/reputation/services/reputation-query.service.js';

/**
 * Adaptador de `HostEligibilityPort` (spec 001 T013): compone la habilitación manual vigente
 * (`host_enablements`, spec 009, RF-007-17) con la vía por calificación (spec 007, RF-007-15:
 * 4,5 estrellas y 6 cobros considerados, calculada en el momento). La manual manda y no se
 * pierde al bajar la calificación.
 */
@Injectable()
export class HostEligibilityAdapter implements HostEligibilityPort {
  constructor(
    private readonly clock: Clock,
    private readonly ratings: ReputationQueryService,
  ) {}

  async check(q: Queryable, userId: string): Promise<HostEligibility> {
    const result = await q.query<{ enabled: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM host_enablements WHERE user_id = $1 AND revoked_at IS NULL
       ) AS enabled`,
      [userId],
    );
    const manual = result.rows[0]?.enabled === true;
    const rating = await this.ratings.checkHostRating(q, userId, this.clock.now());
    const source = manual ? 'manual' : rating.ok ? 'calificacion' : null;
    return {
      eligible: source !== null,
      source,
      requirement: HOST_REQUIREMENT,
      current: {
        stars: rating.stars,
        consideredCharges: rating.consideredCount,
        level: rating.level,
      },
    };
  }
}
