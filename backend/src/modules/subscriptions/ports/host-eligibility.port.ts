import type { Queryable } from '../../../shared/db/db.service.js';

export interface HostEligibility {
  eligible: boolean;
  /** Datos de elegibilidad que se devuelven en NOT_HOST_ELIGIBLE (sin datos personales). */
  details: Record<string, unknown>;
}

/** ¿Puede ser titular? Lo implementa administración (spec 009). */
export interface HostEligibilityPort {
  check(q: Queryable, userId: string): Promise<HostEligibility>;
}

export const HOST_ELIGIBILITY_PORT = Symbol('HOST_ELIGIBILITY_PORT');
