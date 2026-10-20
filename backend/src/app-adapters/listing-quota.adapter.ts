import { Injectable } from '@nestjs/common';
import type { Queryable } from '../shared/db/db.service.js';
import type { ListingQuotaPort } from '../modules/join-requests/ports/listing-quota.port.js';
import { ListingsRepository } from '../modules/listings/repositories/listings.repository.js';

/** Adaptador de `ListingQuotaPort` (spec 010) sobre el repositorio de `listings` (RNF-008-03). */
@Injectable()
export class ListingQuotaAdapter implements ListingQuotaPort {
  constructor(private readonly listings: ListingsRepository) {}

  remainingOffered(q: Queryable, listingId: string): Promise<number> {
    return this.listings.remainingOffered(q, listingId);
  }
}
