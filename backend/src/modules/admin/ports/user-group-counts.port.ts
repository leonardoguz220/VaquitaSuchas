import type { Queryable } from '../../../shared/db/db.service.js';

export interface UserGroupCounts {
  /** Grupos activos que posee. */
  asHost: number;
  /** Grupos activos donde es miembro sin ser titular. */
  asMember: number;
}

/**
 * Conteos de grupos de una persona para la ficha de administración (RF-009-09). Los resuelve
 * `app-adapters` con los repositorios de `subscriptions`, para que `admin` no dependa de ese módulo.
 */
export interface UserGroupCountsPort {
  count(q: Queryable, userId: string): Promise<UserGroupCounts>;
}

export const USER_GROUP_COUNTS_PORT = Symbol('USER_GROUP_COUNTS_PORT');
