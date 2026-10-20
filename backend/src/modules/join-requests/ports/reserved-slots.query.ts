import type { Queryable } from '../../../shared/db/db.service.js';

/**
 * Cupos reservados de un grupo por solicitudes en `esperando_pago` o `pago_informado` con plazo
 * vigente (RN-010-02). Lo define la spec 008 (`ReservedSlotsQuery.count(groupId, now)`) y lo
 * implementa la spec 010; `ListingsService` lo consume para calcular los cupos disponibles.
 */
export interface ReservedSlotsQuery {
  count(q: Queryable, groupId: string, now: Date): Promise<number>;
}

export const RESERVED_SLOTS_QUERY = Symbol('RESERVED_SLOTS_QUERY');
