import type { Queryable } from '../../../shared/db/db.service.js';

/**
 * Cupos que una publicación todavía ofrece (spec 008, `slots_offered`). Lo define la spec 010 y lo
 * implementa `listings` en `app-adapters/` (sin que `join-requests` dependa de `listings`).
 * `sendPaymentData` lo compara con las solicitudes de esa publicación ya reservadas, de modo que
 * dos solicitudes no compitan por el mismo cupo ofrecido (RF-010-20, CA-010-06, CA-008-12).
 */
export interface ListingQuotaPort {
  /** Cupos que todavía se ofrecen; 0 si la publicación está cerrada o no existe. */
  remainingOffered(q: Queryable, listingId: string): Promise<number>;
}

export const LISTING_QUOTA_PORT = Symbol('LISTING_QUOTA_PORT');
