import type { Queryable } from '../../../shared/db/db.service.js';

/** Cobros abiertos de un miembro en un grupo; lo implementa billing (spec 002). */
export interface OpenChargesPort {
  countOpenCharges(q: Queryable, groupId: string, userId: string): Promise<number>;
}

export const OPEN_CHARGES_PORT = Symbol('OPEN_CHARGES_PORT');
