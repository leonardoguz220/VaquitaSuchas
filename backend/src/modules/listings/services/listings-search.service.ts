import { Inject, Injectable } from '@nestjs/common';
import { Clock } from '../../../shared/clock/clock.js';
import { DbService, type Queryable } from '../../../shared/db/db.service.js';
import { DomainError } from '../../../shared/errors/domain-error.js';
import { DEFAULT_MESSAGES, ErrorCode } from '../../../shared/errors/error-codes.js';
import { entryWindow } from '../../subscriptions/domain/entry-window.js';
import {
  REPUTATION_QUERY_PORT,
  type ReputationQueryPort,
} from '../../join-requests/ports/reputation-query.port.js';
import { estimatedShare } from '../domain/estimated-share.js';
import { requestEligibility } from '../domain/request-eligibility.js';
import {
  decodeSearchCursor,
  encodeSearchCursor,
  type ListingSort,
} from '../domain/search-cursor.js';
import {
  ListingsSearchRepository,
  type ListingSearchRow,
  type SearchFilters,
} from '../repositories/listings-search.repository.js';
import type { ListingsPage, ListingView, OwnerLevel } from './listing-views.js';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 50;

export interface SearchQuery extends SearchFilters {
  sort?: ListingSort;
  limit?: number;
  cursor?: string;
}

interface ViewContext {
  myRequest: { id: string; status: string } | null;
  openCharges: number;
  activeTotal: number;
  restricted: boolean;
  level: OwnerLevel;
}

const LEVELS: readonly OwnerLevel[] = ['Nuevo', 'En riesgo', 'Regular', 'Bueno', 'Excelente'];
const toLevel = (level: string | null): OwnerLevel =>
  (LEVELS as readonly string[]).includes(level ?? '') ? (level as OwnerLevel) : 'Nuevo';

const validation = (fields: Record<string, string[]>): DomainError =>
  new DomainError(ErrorCode.VALIDATION_ERROR, 400, DEFAULT_MESSAGES.VALIDATION_ERROR, { fields });

const listingNotFound = (): DomainError =>
  new DomainError('LISTING_NOT_FOUND', 404, 'No se encontró la publicación.');

/**
 * Búsqueda y detalle de publicaciones para usuarios con sesión (spec 008 US2). Solo lee:
 * permisos y exclusiones los decide la consulta; la cuota estimada y `canRequest` salen de
 * funciones puras (RF-008-03, RF-008-07 a 09).
 */
@Injectable()
export class ListingsSearchService {
  constructor(
    private readonly db: DbService,
    private readonly clock: Clock,
    private readonly search: ListingsSearchRepository,
    @Inject(REPUTATION_QUERY_PORT) private readonly reputation: ReputationQueryPort,
  ) {}

  async list(userId: string, query: SearchQuery): Promise<ListingsPage> {
    const sort = query.sort ?? 'fecha';
    const limit = Math.min(query.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    if (
      query.minShareCents !== undefined &&
      query.maxShareCents !== undefined &&
      query.minShareCents > query.maxShareCents
    ) {
      throw validation({ minShareCents: ['RANGE_INVALID'] });
    }
    const cursor = query.cursor ? decodeSearchCursor(query.cursor, sort) : null;
    if (query.cursor && !cursor) throw validation({ cursor: ['INVALID_CURSOR'] });

    const now = this.clock.now();
    const filters: SearchFilters = {
      ...(query.serviceId && { serviceId: query.serviceId }),
      ...(query.q && { q: query.q }),
      ...(query.category && { category: query.category }),
      ...(query.minShareCents !== undefined && { minShareCents: query.minShareCents }),
      ...(query.maxShareCents !== undefined && { maxShareCents: query.maxShareCents }),
    };
    const rows = await this.search.search(this.db, {
      userId,
      now,
      filters,
      sort,
      cursor,
      limit: limit + 1,
    });
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    const items = await this.toViews(userId, page, now);
    return {
      items,
      nextCursor:
        rows.length > limit && last
          ? encodeSearchCursor({
              sort,
              key: last.sortKey,
              publishedAt: last.publishedAtCursor,
              id: last.id,
            })
          : null,
    };
  }

  async getOne(userId: string, listingId: string): Promise<ListingView> {
    const now = this.clock.now();
    const row = await this.search.findVisible(this.db, listingId, userId, now);
    if (!row) throw listingNotFound();
    const [view] = await this.toViews(userId, [row], now);
    return view as ListingView;
  }

  private async toViews(
    userId: string,
    rows: readonly ListingSearchRow[],
    now: Date,
  ): Promise<ListingView[]> {
    if (rows.length === 0) return [];
    const groupIds = rows.map((row) => row.groupId);
    const [mine, charges, activeTotal, status, reputation] = await Promise.all([
      this.search.myActiveRequests(this.db, userId, groupIds),
      this.search.openChargesByGroup(this.db, userId, groupIds),
      this.search.countActiveRequests(this.db, userId),
      this.search.accountStatus(this.db, userId),
      this.reputation.getMany(this.db, [...new Set(rows.map((row) => row.ownerId))]),
    ]);
    return rows.map((row) =>
      this.buildView(row, now, {
        myRequest: mine.get(row.groupId) ?? null,
        openCharges: charges.get(row.groupId) ?? 0,
        activeTotal,
        restricted: status !== 'activo',
        level: toLevel(reputation.get(row.ownerId)?.level ?? null),
      }),
    );
  }

  /**
   * Cómo ve la publicación una persona cualquiera (vista previa del titular, `OwnerListing.preview`):
   * sin solicitudes ni cobros propios. `null` si no está `activa` y vigente.
   */
  async previewOf(q: Queryable, listingId: string, now: Date): Promise<ListingView | null> {
    const row = await this.search.findForPreview(q, listingId, now);
    if (!row) return null;
    const reputation = await this.reputation.getMany(q, [row.ownerId]);
    return this.buildView(row, now, {
      myRequest: null,
      openCharges: 0,
      activeTotal: 0,
      restricted: false,
      level: toLevel(reputation.get(row.ownerId)?.level ?? null),
    });
  }

  private buildView(row: ListingSearchRow, now: Date, ctx: ViewContext): ListingView {
    const window = entryWindow({ billingDay: row.billingDay, createdAt: row.groupCreatedAt }, now);
    const eligibility = requestEligibility({
      accountRestricted: ctx.restricted,
      // La consulta ya exige grupo activo, sin congelar y que recibe miembros.
      group: { status: 'activo', frozen: false, acceptingMembers: true },
      windowOpen: window.isOpen,
      availableSlots: row.offered,
      isMember: false,
      openChargesInGroup: ctx.openCharges,
      activeRequestsInGroup: ctx.myRequest ? 1 : 0,
      activeRequestsTotal: ctx.activeTotal,
    });
    return {
      id: row.id,
      service: {
        name: row.serviceName,
        planName: row.planName,
        logoUrl: row.logoUrl,
        brandColor: row.brandColor,
        category: row.category,
      },
      slotsOffered: row.offered,
      estimatedShareCents: estimatedShare(row.totalBsCents, row.members, row.offered),
      estimatedShareLabel: 'estimada',
      billingDay: row.billingDay,
      owner: { fullName: row.ownerName, level: ctx.level },
      description: row.description,
      conditions: row.conditions,
      publishedAt: row.publishedAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      entryWindow: {
        isOpen: window.isOpen,
        opensAt: window.opensAt?.toISOString() ?? null,
        closesAt: window.closesAt?.toISOString() ?? null,
      },
      myRequest: ctx.myRequest,
      ...eligibility,
    };
  }
}
