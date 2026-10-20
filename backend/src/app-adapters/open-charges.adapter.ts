import { Injectable } from '@nestjs/common';
import type { Queryable } from '../shared/db/db.service.js';
import type { OpenChargesPort } from '../modules/subscriptions/ports/open-charges.port.js';

/**
 * Adaptador de `OpenChargesPort` (spec 001): cobros no pagados de un miembro en un grupo
 * (`pendiente`, `en_revision` o `atrasado`, RF-001-16). Lee la tabla `charges` de la spec 002 sin
 * que `subscriptions` dependa del módulo `billing`.
 */
@Injectable()
export class OpenChargesAdapter implements OpenChargesPort {
  async countOpenCharges(q: Queryable, groupId: string, userId: string): Promise<number> {
    const result = await q.query<{ total: string }>(
      `SELECT count(*) AS total FROM charges
        WHERE group_id = $1 AND user_id = $2 AND status IN ('pendiente', 'en_revision', 'atrasado')`,
      [groupId, userId],
    );
    return Number(result.rows[0]?.total ?? 0);
  }
}
