import { Inject, Injectable } from '@nestjs/common';
import { Clock } from '../../../shared/clock/clock.js';
import { DbService, type DbTransaction, type Queryable } from '../../../shared/db/db.service.js';
import { DomainError } from '../../../shared/errors/domain-error.js';
import { DEFAULT_MESSAGES, ErrorCode } from '../../../shared/errors/error-codes.js';
import type {
  JoinRequestOpened,
  JoinRequestRejected,
} from '../../../shared/events/join-request-events.js';
import { TxEventBus } from '../../../shared/events/tx-event-bus.js';
import { toLaPazParts } from '../../../shared/domain/la-paz.js';
import { lastCutAtOrBefore, periodOf } from '../../subscriptions/domain/billing-calendar.js';
import { entryWindow } from '../../subscriptions/domain/entry-window.js';
import {
  OPEN_CHARGES_PORT,
  type OpenChargesPort,
} from '../../subscriptions/ports/open-charges.port.js';
import {
  GroupsRepository,
  type GroupRow,
} from '../../subscriptions/repositories/groups.repository.js';
import { MembersRepository } from '../../subscriptions/repositories/members.repository.js';
import { InviteCodeService } from '../../subscriptions/services/invite-code.service.js';
import { canOpenRequest } from '../domain/can-open-request.js';
import { computeDeadlines } from '../domain/deadlines.js';
import { openRequestError } from '../domain/open-request-errors.js';
import { decodeCursor, encodeCursor } from '../domain/page-cursor.js';
import { transition, type RequestStatus } from '../domain/request-state.js';
import { availableSlots } from '../domain/slots.js';
import { LISTING_QUOTA_PORT, type ListingQuotaPort } from '../ports/listing-quota.port.js';
import { RequestEventsRepository } from '../repositories/events.repository.js';
import { MessagesRepository } from '../repositories/messages.repository.js';
import {
  RequestsRepository,
  type JoinRequestRecord,
  type ListScope,
} from '../repositories/requests.repository.js';
import { currentDeadline, RequestLifecycle } from './request-lifecycle.js';
import { RequestViewService } from './request-view.service.js';
import type {
  GroupJoinRequestsPage,
  JoinRequestsPage,
  JoinRequestsSummary,
  JoinRequestView,
} from './request-views.js';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 50;

export interface ListQuery {
  role?: 'solicitante' | 'titular';
  statuses?: RequestStatus[];
  groupId?: string;
  limit?: number;
  cursor?: string;
}

/** Quién es la persona frente a una solicitud (RNF-010-01). */
export interface RequestAccess {
  record: JoinRequestRecord;
  group: GroupRow;
  role: 'solicitante' | 'titular';
}

/** Publicación de origen de una solicitud (spec 008): lo mínimo que necesita `openFromListing`. */
export interface ListingRef {
  id: string;
  groupId: string;
}

const notFound = (): DomainError =>
  new DomainError(ErrorCode.NOT_FOUND, 404, DEFAULT_MESSAGES.NOT_FOUND);

interface PgError {
  code?: string;
  constraint?: string;
  message?: string;
}

/** Errores de los disparadores de 0054 y del índice único, traducidos al contrato (carreras de apertura). */
function mapInsertError(error: unknown): unknown {
  const pg = error as PgError;
  if (pg?.code === '23505' && pg.constraint === 'join_requests_active_uq') {
    return openRequestError(['active_request_in_group'], null);
  }
  if (pg?.code === '23514') {
    if (pg.message === 'too many active join requests') {
      return openRequestError(['too_many_active_requests'], null);
    }
    if (pg.message === 'applicant is already a group member') {
      return openRequestError(['already_member'], null);
    }
    if (pg.message === 'group is not open for join requests') {
      return openRequestError(['group_frozen'], null);
    }
  }
  return error;
}

/** Solicitudes de ingreso: apertura, consulta y colas (spec 010, US1). */
@Injectable()
export class JoinRequestsService {
  constructor(
    private readonly db: DbService,
    private readonly clock: Clock,
    private readonly bus: TxEventBus,
    private readonly invites: InviteCodeService,
    private readonly groups: GroupsRepository,
    private readonly members: MembersRepository,
    private readonly requests: RequestsRepository,
    private readonly events: RequestEventsRepository,
    private readonly messages: MessagesRepository,
    private readonly lifecycle: RequestLifecycle,
    private readonly views: RequestViewService,
    @Inject(OPEN_CHARGES_PORT) private readonly openCharges: OpenChargesPort,
    @Inject(LISTING_QUOTA_PORT) private readonly listingQuota: ListingQuotaPort,
  ) {}

  /**
   * Abre una solicitud con un código (RF-010-01 a RF-010-04). Persiste los vencimientos del
   * solicitante, evalúa `canOpenRequest` con la ventana y los cupos, inserta con `open_deadline_at`,
   * deja el evento `abierta` y publica `JoinRequestOpened`, todo en una transacción.
   */
  async open(userId: string, code: string): Promise<JoinRequestView> {
    const resolved = await this.invites.resolve(userId, code);
    return this.openIn(userId, resolved.id, { listingId: null, message: null });
  }

  /**
   * Abre una solicitud desde una publicación (spec 008, RF-008-10): igual que `open` pero sin
   * código; la publicación identifica el grupo. Guarda `source = 'publicacion'`, `listing_id` y,
   * si hay mensaje, la primera línea del chat. El mensaje llega ya validado y normalizado.
   */
  async openFromListing(
    userId: string,
    listing: ListingRef,
    message: string | null,
  ): Promise<JoinRequestView> {
    return this.openIn(userId, listing.groupId, { listingId: listing.id, message });
  }

  /**
   * Rechaza las solicitudes `abierta` de una publicación cerrada u ocultada (RN-010-05, CA-008-11).
   * Las que ya están en pago siguen su curso. Corre en la transacción de quien llama; es
   * idempotente (solo toca solicitudes todavía `abierta`).
   */
  async rejectOpenForListing(
    tx: DbTransaction,
    listingId: string,
    reason: 'sin_cupo',
  ): Promise<number> {
    const now = this.clock.now();
    let rejected = 0;
    for (const locked of await this.requests.listOpenByListingForUpdate(tx, listingId)) {
      const record = await this.lifecycle.expireIfDue(tx, locked, now);
      if (record.status !== 'abierta') continue;
      transition(record.status, 'systemReject', {
        now,
        windowOpen: true,
        slotAvailable: true,
        deadlineAt: currentDeadline(record),
      });
      await this.requests.recordSystemRejection(tx, record.id, record.status, reason, now);
      await this.events.insert(tx, {
        requestId: record.id,
        type: 'rechazada',
        actorId: null,
        fromStatus: record.status,
        toStatus: 'rechazada',
        reason,
        occurredAt: now,
      });
      const group = (await this.groups.findById(tx, record.groupId)) as GroupRow;
      const event: JoinRequestRejected = {
        type: 'join-requests.rejected',
        requestId: record.id,
        groupId: record.groupId,
        applicantId: record.applicantId,
        hostId: group.owner_id,
        reason,
        byHost: false,
        rejectedAsFalse: false,
      };
      await this.bus.publish(tx, event);
      rejected += 1;
    }
    return rejected;
  }

  /** Apertura común (RF-010-01 a RF-010-04); `origin.listingId` la marca como de una publicación. */
  private async openIn(
    userId: string,
    groupId: string,
    origin: { listingId: string | null; message: string | null },
  ): Promise<JoinRequestView> {
    return this.db.withTransaction(async (tx) => {
      const now = this.clock.now();
      // Primero se persisten los vencimientos (R1) para que una vencida no ocupe el índice único.
      for (const active of await this.requests.listActiveByApplicantForUpdate(tx, userId)) {
        await this.lifecycle.expireIfDue(tx, active, now);
      }
      if (
        origin.listingId !== null &&
        (await this.listingQuota.remainingOffered(tx, origin.listingId)) < 1
      ) {
        throw new DomainError('LISTING_NOT_FOUND', 404, 'No se encontró la publicación.');
      }
      const group = (await this.groups.findById(tx, groupId)) as GroupRow;
      const window = entryWindow(
        { billingDay: group.billing_day, createdAt: group.created_at },
        now,
      );
      const activeMembers = await this.members.countActive(tx, group.id);
      const reserved = await this.requests.countReserved(tx, group.id, now);
      const accountStatus = await this.requests.accountStatus(tx, userId);
      const openChargesInGroup =
        (await this.openCharges.countOpenCharges(tx, group.id, userId)) +
        (await this.requests.countNonCancelledChargesInPeriod(
          tx,
          group.id,
          userId,
          this.currentPeriod(group, now),
        ));
      const slots = availableSlots({ totalSlots: group.total_slots, activeMembers, reserved });

      const broken = canOpenRequest({
        accountRestricted: accountStatus !== 'activo',
        group: {
          status: group.status,
          frozen: group.frozen_at !== null,
          acceptingMembers: group.accepting_members,
        },
        windowOpen: window.isOpen,
        availableSlots: slots,
        isMember: (await this.members.findActive(tx, group.id, userId)) !== null,
        openChargesInGroup,
        activeRequestsInGroup: await this.requests.countActive(tx, userId, group.id),
        activeRequestsTotal: await this.requests.countActive(tx, userId),
      });
      if (broken.length > 0) throw openRequestError(broken, window.opensAt);

      const to = transition(null, 'open', {
        now,
        windowOpen: window.isOpen,
        slotAvailable: slots > 0,
        deadlineAt: null,
      });
      const deadlines = computeDeadlines('open', now, { windowEndExclusive: window.endExclusive });
      let record: JoinRequestRecord;
      try {
        record = await this.requests.insert(tx, {
          groupId: group.id,
          applicantId: userId,
          source: origin.listingId === null ? 'codigo' : 'publicacion',
          listingId: origin.listingId,
          openedAt: now,
          openDeadlineAt: deadlines.openDeadlineAt as Date,
        });
      } catch (error) {
        throw mapInsertError(error);
      }
      await this.events.insert(tx, {
        requestId: record.id,
        type: 'abierta',
        actorId: userId,
        fromStatus: null,
        toStatus: to,
        occurredAt: now,
      });
      const event: JoinRequestOpened = {
        type: 'join-requests.opened',
        requestId: record.id,
        groupId: group.id,
        applicantId: userId,
        hostId: group.owner_id,
        source: origin.listingId === null ? 'codigo' : 'publicacion',
        listingId: origin.listingId,
      };
      if (origin.message !== null) {
        await this.messages.insert(tx, {
          requestId: record.id,
          senderId: userId,
          body: origin.message,
        });
      }
      await this.bus.publish(tx, event);
      return this.viewOne(tx, record, userId, now);
    });
  }

  /** `GET /join-requests/:id` (solicitante o titular; miembro ajeno 403; ajeno 404). */
  async get(userId: string, requestId: string): Promise<JoinRequestView> {
    const now = this.clock.now();
    const access = await this.access(this.db, requestId, userId);
    return this.viewOne(this.db, access.record, userId, now);
  }

  /** `GET /join-requests` (RF-010-26). */
  async list(userId: string, query: ListQuery): Promise<JoinRequestsPage> {
    const scope: ListScope =
      query.role === 'solicitante'
        ? { kind: 'applicant', userId }
        : query.role === 'titular'
          ? { kind: 'host', userId }
          : { kind: 'either', userId };
    return this.page(scope, query);
  }

  /** `GET /groups/:groupId/join-requests`: cola del titular, con los cupos del grupo. */
  async listForGroup(
    userId: string,
    groupId: string,
    query: ListQuery,
  ): Promise<GroupJoinRequestsPage> {
    const group = await this.groups.findById(this.db, groupId);
    if (!group) throw notFound();
    if (group.owner_id !== userId) {
      const member = await this.members.findActive(this.db, groupId, userId);
      if (!member) throw notFound();
      throw new DomainError(ErrorCode.FORBIDDEN, 403, DEFAULT_MESSAGES.FORBIDDEN);
    }
    const page = await this.page({ kind: 'group', groupId }, { ...query, groupId: undefined });
    return { ...page, slots: await this.views.slotsOf(this.db, groupId, this.clock.now()) };
  }

  /** `GET /me/join-requests/summary` (insignias de la barra). */
  async summary(userId: string): Promise<JoinRequestsSummary> {
    const now = this.clock.now();
    return {
      unreadMessages: await this.messages.unreadTotal(this.db, userId),
      actionableAsHost: await this.requests.countActionableAsHost(this.db, userId, now),
      activeAsApplicant: await this.requests.countActiveAsApplicant(this.db, userId, now),
    };
  }

  /**
   * Papel de la persona: solicitante, titular actual, otro miembro activo (`403`) o ajena (`404`).
   * El administrador no tiene acceso por esta vía (contrato, reglas de acceso).
   */
  async access(q: Queryable, requestId: string, userId: string): Promise<RequestAccess> {
    const record = await this.requests.findById(q, requestId);
    if (!record) throw notFound();
    const group = (await this.groups.findById(q, record.groupId)) as GroupRow;
    if (record.applicantId === userId) return { record, group, role: 'solicitante' };
    if (group.owner_id === userId) return { record, group, role: 'titular' };
    const member = await this.members.findActive(q, group.id, userId);
    if (member) throw new DomainError(ErrorCode.FORBIDDEN, 403, DEFAULT_MESSAGES.FORBIDDEN);
    throw notFound();
  }

  private async viewOne(
    q: Queryable,
    record: JoinRequestRecord,
    userId: string,
    now: Date,
  ): Promise<JoinRequestView> {
    const [view] = await this.views.build(q, [record], userId, now, { timeline: true });
    return view as JoinRequestView;
  }

  private async page(scope: ListScope, query: ListQuery): Promise<JoinRequestsPage> {
    const limit = Math.min(Math.max(query.limit ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
    let cursor: ReturnType<typeof decodeCursor> = null;
    if (query.cursor) {
      cursor = decodeCursor(query.cursor);
      if (!cursor) {
        throw new DomainError(ErrorCode.VALIDATION_ERROR, 400, DEFAULT_MESSAGES.VALIDATION_ERROR);
      }
    }
    const viewerId = scope.kind === 'group' ? await this.ownerOf(scope.groupId) : scope.userId;
    const rows = await this.requests.list(this.db, scope, {
      ...(query.statuses && { statuses: query.statuses }),
      ...(query.groupId && { groupId: query.groupId }),
      limit,
      cursor,
    });
    const pageRows = rows.slice(0, limit);
    const last = pageRows[pageRows.length - 1];
    const items = await this.views.build(this.db, pageRows, viewerId, this.clock.now(), {
      timeline: false,
    });
    return {
      items,
      nextCursor:
        rows.length > limit && last ? encodeCursor({ openedAt: last.openedAt, id: last.id }) : null,
    };
  }

  private async ownerOf(groupId: string): Promise<string> {
    return ((await this.groups.findById(this.db, groupId)) as GroupRow).owner_id;
  }

  /** Período vigente del grupo (H3): el del último corte, o el mes de creación si aún no hubo corte regular. */
  private currentPeriod(group: GroupRow, now: Date): string {
    const cut = lastCutAtOrBefore(now, group.billing_day, group.created_at);
    const parts = toLaPazParts(cut);
    return periodOf({ year: parts.year, month: parts.month, day: parts.day });
  }
}
