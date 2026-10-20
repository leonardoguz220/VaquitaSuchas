import type { Queryable } from '../../../shared/db/db.service.js';

/** Umbral para ser titular por calificación (RF-007-15, `contracts/api.md` de la spec 001). */
export interface HostRequirement {
  minStars: number;
  minConsideredCharges: number;
  windowMonths: number;
}

export const HOST_REQUIREMENT: HostRequirement = {
  minStars: 4.5,
  minConsideredCharges: 6,
  windowMonths: 12,
};

export interface HostEligibility {
  eligible: boolean;
  /** `manual`: habilitación del administrador (spec 009); `calificacion`: reputación (spec 007). */
  source: 'manual' | 'calificacion' | null;
  requirement: HostRequirement;
  /** Calificación actual de la persona (sin datos personales); `null` mientras no exista la spec 007. */
  current: { stars: number | null; consideredCharges: number; level: string | null };
}

/** ¿Puede ser titular? Lo implementa un adaptador en `app-adapters/` (specs 007 y 009). */
export interface HostEligibilityPort {
  check(q: Queryable, userId: string): Promise<HostEligibility>;
}

export const HOST_ELIGIBILITY_PORT = Symbol('HOST_ELIGIBILITY_PORT');
