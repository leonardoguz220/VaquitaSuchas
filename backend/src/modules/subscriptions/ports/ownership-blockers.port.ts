import type { Queryable } from '../../../shared/db/db.service.js';

/** Motivos que impiden transferir la titularidad o cerrar un grupo; lo implementan otras specs. */
export interface OwnershipBlockersPort {
  blockers(q: Queryable, groupId: string): Promise<string[]>;
}

export const OWNERSHIP_BLOCKERS_PORT = Symbol('OWNERSHIP_BLOCKERS_PORT');
