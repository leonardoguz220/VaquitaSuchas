import type { Queryable } from '../../../shared/db/db.service.js';

/** Pertenencia y titularidad de grupos (spec 001); `reports` la consume para validar `groupId`. */
export interface SubscriptionMembershipQuery {
  /** Grupos donde la persona es miembro o titular activo. */
  groupIdsOf(q: Queryable, userId: string): Promise<string[]>;
  /** `true` si es el titular activo del grupo. */
  isOwner(q: Queryable, userId: string, groupId: string): Promise<boolean>;
}

export const SUBSCRIPTION_MEMBERSHIP_QUERY = Symbol('SUBSCRIPTION_MEMBERSHIP_QUERY');
