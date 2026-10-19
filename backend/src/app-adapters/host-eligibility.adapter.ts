import { Injectable } from '@nestjs/common';
import type { Queryable } from '../shared/db/db.service.js';
import {
  HOST_REQUIREMENT,
  type HostEligibility,
  type HostEligibilityPort,
} from '../modules/subscriptions/ports/host-eligibility.port.js';

/**
 * Adaptador de `HostEligibilityPort` (spec 001 T013). Hoy compone solo la habilitación manual
 * vigente (`host_enablements`, spec 009). La vía por calificación (spec 007, ≥ 4,5 estrellas con
 * ≥ 6 cobros considerados) responde «no habilitado» hasta que exista la reputación; entonces se
 * consulta aquí `ReputationQueryPort.checkHostRating` (spec 009 T020).
 */
@Injectable()
export class HostEligibilityAdapter implements HostEligibilityPort {
  async check(q: Queryable, userId: string): Promise<HostEligibility> {
    const result = await q.query<{ enabled: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM host_enablements WHERE user_id = $1 AND revoked_at IS NULL
       ) AS enabled`,
      [userId],
    );
    const manual = result.rows[0]?.enabled === true;
    return {
      eligible: manual,
      source: manual ? 'manual' : null,
      requirement: HOST_REQUIREMENT,
      current: { stars: null, consideredCharges: 0, level: null },
    };
  }
}
