import { Inject, Injectable } from '@nestjs/common';
import { Clock } from '../../../shared/clock/clock.js';
import { DbService, type DbTransaction, type Queryable } from '../../../shared/db/db.service.js';
import { DomainError } from '../../../shared/errors/domain-error.js';
import { DEFAULT_MESSAGES, ErrorCode } from '../../../shared/errors/error-codes.js';
import type { JoinRequestAccepted } from '../../../shared/events/join-request-events.js';
import {
  RESERVED_SLOTS_QUERY,
  type ReservedSlotsQuery,
} from '../../join-requests/ports/reserved-slots.query.js';
import { availableSlots } from '../../join-requests/domain/slots.js';
import { JoinRequestsService } from '../../join-requests/services/join-requests.service.js';
import type { JoinRequestView } from '../../join-requests/services/request-views.js';
import {
  canPublish,
  expiresAt,
  nextStatus,
  type CannotPublishReason,
} from '../domain/listing-lifecycle.js';
import { clampOffered, offeredNow } from '../domain/offered-slots.js';
import { normalizePlainText } from '../domain/plain-text.js';
import { ListingReportsRepository } from '../repositories/listing-reports.repository.js';
import {
  ListingsRepository,
  type ListingChanges,
  type ListingRecord,
  type LockedGroup,
} from '../repositories/listings.repository.js';
import { ListingsSearchRepository } from '../repositories/listings-search.repository.js';
import type { GroupListingSummary, OwnerListing } from './listing-views.js';
import { ListingsSearchService } from './listings-search.service.js';

export const MAX_LISTING_TEXT = 300;
export const MAX_REQUEST_MESSAGE = 200;

export interface PublishInput {
  slotsOffered: number;
  description?: string | null;
  conditions?: string | null;
}

export interface UpdateInput {
  slotsOffered?: number;
  description?: string | null;
  conditions?: string | null;
  version?: number;
}

const validation = (fields: Record<string, string[]>): DomainError =>
  new DomainError(ErrorCode.VALIDATION_ERROR, 400, DEFAULT_MESSAGES.VALIDATION_ERROR, { fields });

const notFound = (): DomainError =>
  new DomainError(ErrorCode.NOT_FOUND, 404, DEFAULT_MESSAGES.NOT_FOUND);

const forbidden = (): DomainError =>
  new DomainError(ErrorCode.FORBIDDEN, 403, DEFAULT_MESSAGES.FORBIDDEN);

const listingNotFound = (): DomainError =>
  new DomainError('LISTING_NOT_FOUND', 404, 'No se encontró la publicación.');

const alreadyActive = (): DomainError =>
  new DomainError('LISTING_ALREADY_ACTIVE', 409, 'El grupo ya tiene una publicación activa.', {
    rule: 'RF-008-02',
  });

const staleState = (): DomainError =>
  new DomainError('STALE_STATE', 409, 'La publicación cambió. Actualiza e inténtalo de nuevo.');

/** Razones de `canPublish` traducidas a los códigos del contrato 008. */
function publishError(reason: CannotPublishReason, freeSlots: number): DomainError {
  switch (reason) {
    case 'INVALID_SLOTS':
      return validation({ slotsOffered: ['INVALID'] });
    case 'NO_FREE_SLOTS':
      return new DomainError('NO_FREE_SLOTS', 422, 'No hay cupos libres.', {
        rule: 'RF-008-01',
        freeSlots,
      });
    case 'GROUP_NOT_ACCEPTING':
      return new DomainError('GROUP_NOT_ACCEPTING', 422, 'El grupo no está recibiendo miembros.', {
        rule: 'RF-001-09',
      });
    case 'GROUP_CLOSED':
      return new DomainError('GROUP_CLOSED', 422, 'El grupo está cerrado.', { rule: 'RF-008-01' });
    case 'GROUP_FROZEN':
      return new DomainError(
        'GROUP_FROZEN',
        422,
        'El grupo está congelado y solo se puede consultar.',
        { rule: 'RF-009-22' },
      );
  }
}

/** Texto libre (RN-008-07): `undefined` = sin cambio; vacío o `null` = borrar. */
function plainText(
  field: string,
  value: string | null | undefined,
  max: number,
): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const result = normalizePlainText(value, max);
  if (!result.ok) throw validation({ [field]: [result.reason] });
  return result.value;
}

/**
 * Publicaciones de cupos libres del titular y solicitud de un cupo (spec 008, US1 y US3). Las
 * mutaciones bloquean el grupo (`FOR UPDATE`) y después la publicación (RNF-008-03): la solicitud
 * ya se bloqueó antes cuando la operación viene de una aceptación.
 */
@Injectable()
export class ListingsService {
  constructor(
    private readonly db: DbService,
    private readonly clock: Clock,
    private readonly listings: ListingsRepository,
    private readonly reports: ListingReportsRepository,
    private readonly search: ListingsSearchRepository,
    private readonly searchService: ListingsSearchService,
    private readonly joinRequests: JoinRequestsService,
    @Inject(RESERVED_SLOTS_QUERY) private readonly reserved: ReservedSlotsQuery,
  ) {}

  /** `POST /groups/:groupId/listing` (RF-008-01, RF-008-02; CA-008-01 a 03, CA-008-22). */
  async publish(userId: string, groupId: string, input: PublishInput): Promise<OwnerListing> {
    const description = plainText('description', input.description, MAX_LISTING_TEXT) ?? null;
    const conditions = plainText('conditions', input.conditions, MAX_LISTING_TEXT) ?? null;
    return this.db.withTransaction(async (tx) => {
      const now = this.clock.now();
      const group = await this.lockOwnedGroup(tx, groupId, userId);
      await this.requireActiveAccount(tx, userId);
      if (await this.listings.findLiveByGroup(tx, groupId, true)) throw alreadyActive();
      const free = await this.freeSlots(tx, group, now);
      const reason = canPublish({ group, freeSlots: free, requested: input.slotsOffered });
      if (reason) throw publishError(reason, free);
      const created = await this.listings.insert(tx, {
        groupId,
        slotsOffered: input.slotsOffered,
        description,
        conditions,
        publishedAt: now,
        expiresAt: expiresAt(now),
      });
      return this.ownerView(tx, created, now);
    });
  }

  /** `GET /groups/:groupId/listing`: titular → `OwnerListing | null`; miembro → resumen. */
  async get(userId: string, groupId: string): Promise<OwnerListing | GroupListingSummary | null> {
    const now = this.clock.now();
    const group = await this.listings.findGroup(this.db, groupId);
    if (!group) throw notFound();
    if (group.ownerId === userId) {
      const latest = await this.listings.findLatestVisibleByGroup(this.db, groupId);
      return latest ? this.ownerView(this.db, latest, now) : null;
    }
    if (!(await this.listings.isActiveMember(this.db, groupId, userId))) throw notFound();
    return this.summaryFor(group, await this.listings.findLiveByGroup(this.db, groupId), now);
  }

  /** `PATCH /groups/:groupId/listing` (RF-008-06): sobre una `activa` u `oculta`. */
  async update(userId: string, groupId: string, input: UpdateInput): Promise<OwnerListing> {
    const description = plainText('description', input.description, MAX_LISTING_TEXT);
    const conditions = plainText('conditions', input.conditions, MAX_LISTING_TEXT);
    return this.db.withTransaction(async (tx) => {
      const now = this.clock.now();
      const group = await this.lockOwnedGroup(tx, groupId, userId);
      await this.requireActiveAccount(tx, userId);
      const live = await this.listings.findLiveByGroup(tx, groupId, true);
      if (!live) throw listingNotFound();
      if (input.version !== undefined && input.version !== live.version) throw staleState();

      const changes: ListingChanges = {};
      if (description !== undefined) changes.description = description;
      if (conditions !== undefined) changes.conditions = conditions;
      if (input.slotsOffered !== undefined && input.slotsOffered !== live.slotsOffered) {
        const free = await this.freeSlots(tx, group, now);
        const reason = canPublish({ group, freeSlots: free, requested: input.slotsOffered });
        if (reason) throw publishError(reason, free);
        changes.slotsOffered = input.slotsOffered;
      }
      if (Object.keys(changes).length === 0) return this.ownerView(tx, live, now);
      const updated = await this.listings.update(tx, live.id, changes, live.version);
      if (!updated) throw staleState();
      return this.ownerView(tx, updated, now);
    });
  }

  /** `POST /groups/:groupId/listing/renew` (RF-008-05): `activa` o `expirada`, +30 días. */
  async renew(userId: string, groupId: string): Promise<OwnerListing> {
    return this.db.withTransaction(async (tx) => {
      const now = this.clock.now();
      const group = await this.lockOwnedGroup(tx, groupId, userId);
      await this.requireActiveAccount(tx, userId);
      const live = await this.listings.findLiveByGroup(tx, groupId, true);
      if (live?.status === 'oculta') {
        throw new DomainError(
          'LISTING_HIDDEN',
          422,
          'La publicación está oculta por reportes y espera la revisión.',
          { rule: 'RF-008-18' },
        );
      }
      const target = live ?? (await this.latestExpired(tx, groupId));
      if (!target) throw listingNotFound();
      const to = nextStatus(target.status, 'renew');
      if (!to) throw listingNotFound();

      const free = await this.freeSlots(tx, group, now);
      // Como en el alta: sin cupos libres no hay publicación (RN-008-04 recorta los ofrecidos).
      const slots = Math.min(target.slotsOffered, free);
      const reason = canPublish({ group, freeSlots: free, requested: Math.max(slots, 1) });
      if (reason) throw publishError(reason, free);
      const changes: ListingChanges = {
        slotsOffered: slots,
        expiresAt: expiresAt(now),
        renewedAt: now,
      };
      // `activa → activa` no es una transición del disparador: solo se escribe el estado si cambia.
      if (to !== target.status) changes.status = to;
      try {
        const renewed = await this.listings.update(tx, target.id, changes);
        return this.ownerView(tx, renewed as ListingRecord, now);
      } catch (error) {
        if ((error as { code?: string }).code === '23505') throw alreadyActive();
        throw error;
      }
    });
  }

  /** `DELETE /groups/:groupId/listing` (RF-008-06): pasa a `retirada`; las solicitudes siguen su flujo. */
  async withdraw(userId: string, groupId: string): Promise<void> {
    await this.db.withTransaction(async (tx) => {
      const now = this.clock.now();
      await this.lockOwnedGroup(tx, groupId, userId);
      const target =
        (await this.listings.findLiveByGroup(tx, groupId, true)) ??
        (await this.latestExpired(tx, groupId));
      if (!target) throw listingNotFound();
      if (!nextStatus(target.status, 'withdraw')) throw listingNotFound();
      await this.listings.update(tx, target.id, {
        status: 'retirada',
        endedAt: now,
        endReason: 'titular',
        hiddenAt: null,
      });
    });
  }

  /**
   * `POST /listings/:id/requests` (RF-008-10; CA-008-08): abre una solicitud de la spec 010 desde
   * la publicación. El mensaje (hasta 200 caracteres) es la primera línea del chat.
   */
  async requestSeat(
    userId: string,
    listingId: string,
    message: string | null | undefined,
  ): Promise<JoinRequestView> {
    const text = plainText('message', message, MAX_REQUEST_MESSAGE) ?? null;
    const row = await this.search.findVisible(this.db, listingId, userId, this.clock.now());
    if (!row) throw listingNotFound();
    return this.joinRequests.openFromListing(userId, { id: row.id, groupId: row.groupId }, text);
  }

  /**
   * `JoinRequestAccepted { listingId? }` (RF-008-14, RN-008-04; CA-008-11). Corre en la transacción
   * de la aceptación, con la solicitud y el grupo ya bloqueados: baja `slots_offered` y, al llegar
   * a 0, cierra la publicación y rechaza las solicitudes `abierta` que quedan.
   */
  async onRequestAccepted(tx: DbTransaction, event: JoinRequestAccepted): Promise<void> {
    if (event.listingId === null) return;
    const now = this.clock.now();
    const group = await this.listings.lockGroup(tx, event.groupId);
    const listing = await this.listings.findByIdForUpdate(tx, event.listingId);
    if (!group || !listing) return;
    if (listing.status === 'retirada' || listing.status === 'cerrada') return;

    const members = await this.listings.countActiveMembers(tx, group.id);
    const next = clampOffered({
      slotsOffered: listing.slotsOffered - 1,
      totalSlots: group.totalSlots,
      members,
    });
    if (listing.status === 'expirada') {
      // No hay transición `expirada → cerrada`: solo se descuenta mientras quede algún cupo.
      if (next >= 1) await this.listings.update(tx, listing.id, { slotsOffered: next });
      return;
    }
    if (next >= 1) {
      await this.listings.update(tx, listing.id, { slotsOffered: next });
      return;
    }
    await this.listings.update(tx, listing.id, {
      status: 'cerrada',
      slotsOffered: 0,
      endedAt: now,
      endReason: listing.slotsOffered - 1 < 1 ? 'cupos_completos' : 'grupo_lleno',
      hiddenAt: null,
    });
    await this.joinRequests.rejectOpenForListing(tx, listing.id, 'sin_cupo');
  }

  private async latestExpired(q: Queryable, groupId: string): Promise<ListingRecord | null> {
    const latest = await this.listings.findLatestVisibleByGroup(q, groupId);
    return latest?.status === 'expirada' ? latest : null;
  }

  /** Bloquea el grupo y exige que la persona sea su titular: miembro → 403; ajena → 404. */
  private async lockOwnedGroup(
    tx: DbTransaction,
    groupId: string,
    userId: string,
  ): Promise<LockedGroup> {
    const group = await this.listings.lockGroup(tx, groupId);
    if (!group) throw notFound();
    if (group.ownerId === userId) return group;
    if (await this.listings.isActiveMember(tx, groupId, userId)) throw forbidden();
    throw notFound();
  }

  /** CA-008-22: una cuenta suspendida o baneada no publica ni edita. */
  private async requireActiveAccount(q: Queryable, userId: string): Promise<void> {
    if ((await this.search.accountStatus(q, userId)) !== 'activo') {
      throw new DomainError(
        'ACCOUNT_RESTRICTED',
        403,
        'Tu cuenta está restringida y no puede publicar cupos.',
        { rule: 'RF-009-10' },
      );
    }
  }

  /** Cupos libres: total − miembros activos − reservados por solicitudes en pago (RN-010-02). */
  private async freeSlots(tx: DbTransaction, group: LockedGroup, now: Date): Promise<number> {
    return availableSlots({
      totalSlots: group.totalSlots,
      activeMembers: await this.listings.countActiveMembers(tx, group.id),
      reserved: await this.reserved.count(tx, group.id, now),
    });
  }

  private async summaryFor(
    group: LockedGroup,
    live: ListingRecord | null,
    now: Date,
  ): Promise<GroupListingSummary> {
    if (!live || live.status !== 'activa' || live.expiresAt.getTime() <= now.getTime()) {
      return { active: false, slotsOffered: null, expiresAt: null };
    }
    const offered = offeredNow({
      slotsOffered: live.slotsOffered,
      totalSlots: group.totalSlots,
      members: await this.listings.countActiveMembers(this.db, group.id),
      reserved: await this.reserved.count(this.db, group.id, now),
    });
    return { active: true, slotsOffered: offered, expiresAt: live.expiresAt.toISOString() };
  }

  private async ownerView(q: Queryable, listing: ListingRecord, now: Date): Promise<OwnerListing> {
    const [reportCount, openRequests, preview] = await Promise.all([
      this.reports.countSince(q, listing.id, listing.moderationClearedAt),
      this.listings.countActiveRequests(q, listing.id),
      this.searchService.previewOf(q, listing.id, now),
    ]);
    return {
      id: listing.id,
      groupId: listing.groupId,
      status: listing.status,
      slotsOffered: listing.slotsOffered,
      description: listing.description,
      conditions: listing.conditions,
      publishedAt: listing.publishedAt.toISOString(),
      expiresAt: listing.expiresAt.toISOString(),
      renewedAt: listing.renewedAt?.toISOString() ?? null,
      hiddenAt: listing.hiddenAt?.toISOString() ?? null,
      endReason: listing.endReason,
      reportCount,
      openRequests,
      preview,
      version: listing.version,
    };
  }
}
