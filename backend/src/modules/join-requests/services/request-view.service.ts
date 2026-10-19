import { Inject, Injectable } from '@nestjs/common';
import type { Queryable } from '../../../shared/db/db.service.js';
import { entryWindow } from '../../subscriptions/domain/entry-window.js';
import {
  GroupsRepository,
  type GroupRow,
} from '../../subscriptions/repositories/groups.repository.js';
import { MembersRepository } from '../../subscriptions/repositories/members.repository.js';
import { allowedActions } from '../domain/allowed-actions.js';
import { disputeEligibility } from '../domain/dispute-rules.js';
import { quoteEntryShare } from '../domain/entry-quote.js';
import { availableSlots } from '../domain/slots.js';
import { DisputesRepository, type DisputeRecord } from '../repositories/disputes.repository.js';
import { RequestEventsRepository } from '../repositories/events.repository.js';
import { MessagesRepository } from '../repositories/messages.repository.js';
import { RequestsRepository, type JoinRequestRecord } from '../repositories/requests.repository.js';
import {
  REPUTATION_QUERY_PORT,
  type ReputationQueryPort,
  type UserReputation,
} from '../ports/reputation-query.port.js';
import { effectiveOf } from './request-lifecycle.js';
import type { JoinRequestView, PersonView } from './request-views.js';

export type ViewerRole = 'solicitante' | 'titular';

const iso = (date: Date | null): string | null => (date ? date.toISOString() : null);

interface GroupContext {
  group: GroupRow;
  members: number;
  reserved: number;
}

/**
 * Arma el objeto `JoinRequest` del contrato: estado efectivo con los plazos vencidos, cuota
 * estimada, `allowedActions` y, en el detalle, la línea de tiempo. Solo lee; nunca escribe (R1).
 * El celular del solicitante no se incluye (contrato, reglas de acceso).
 */
@Injectable()
export class RequestViewService {
  constructor(
    private readonly requests: RequestsRepository,
    private readonly groups: GroupsRepository,
    private readonly members: MembersRepository,
    private readonly events: RequestEventsRepository,
    private readonly messages: MessagesRepository,
    private readonly disputes: DisputesRepository,
    @Inject(REPUTATION_QUERY_PORT) private readonly reputation: ReputationQueryPort,
  ) {}

  /** Cupos de un grupo con el conteo de reservas vigentes (RN-010-02). */
  async slotsOf(q: Queryable, groupId: string, now: Date) {
    const ctx = await this.groupContext(q, groupId, now, new Map());
    return {
      total: ctx.group.total_slots,
      members: ctx.members,
      reserved: ctx.reserved,
      available: availableSlots({
        totalSlots: ctx.group.total_slots,
        activeMembers: ctx.members,
        reserved: ctx.reserved,
      }),
    };
  }

  async build(
    q: Queryable,
    records: readonly JoinRequestRecord[],
    viewerId: string,
    now: Date,
    options: { timeline: boolean },
  ): Promise<JoinRequestView[]> {
    const cache = new Map<string, GroupContext>();
    const groupContexts: GroupContext[] = [];
    for (const record of records) {
      groupContexts.push(await this.groupContext(q, record.groupId, now, cache));
    }
    const personIds = [
      ...new Set([
        ...records.map((r) => r.applicantId),
        ...groupContexts.map((c) => c.group.owner_id),
      ]),
    ];
    const names = await this.requests.fullNames(q, personIds);
    const reputations = await this.reputation.getMany(q, personIds);
    const person = (userId: string): PersonView => {
      const rep: UserReputation = reputations.get(userId) ?? { stars: null, level: null };
      return { userId, fullName: names.get(userId) ?? '', stars: rep.stars, level: rep.level };
    };

    const views: JoinRequestView[] = [];
    for (const [index, record] of records.entries()) {
      const ctx = groupContexts[index] as GroupContext;
      views.push(await this.buildOne(q, record, ctx, viewerId, now, person, options.timeline));
    }
    return views;
  }

  private async buildOne(
    q: Queryable,
    record: JoinRequestRecord,
    ctx: GroupContext,
    viewerId: string,
    now: Date,
    person: (userId: string) => PersonView,
    withTimeline: boolean,
  ): Promise<JoinRequestView> {
    const { group } = ctx;
    const effective = effectiveOf(record, now);
    const stored = record.status;
    const status = effective.status;
    const role: ViewerRole = group.owner_id === viewerId ? 'titular' : 'solicitante';
    const window = entryWindow({ billingDay: group.billing_day, createdAt: group.created_at }, now);
    const slots = availableSlots({
      totalSlots: group.total_slots,
      activeMembers: ctx.members,
      reserved: ctx.reserved,
    });

    // Plazo vigente del estado efectivo (nada tras un vencimiento o un estado final).
    let deadlineAt: Date | null = null;
    let deadlineKind: 'solicitud' | 'pago' | 'decision' | null = null;
    if (status === stored) {
      if (status === 'abierta') [deadlineAt, deadlineKind] = [record.openDeadlineAt, 'solicitud'];
      else if (status === 'esperando_pago')
        [deadlineAt, deadlineKind] = [record.payDeadlineAt, 'pago'];
      else if (status === 'pago_informado') {
        [deadlineAt, deadlineKind] = [record.decisionDeadlineAt, 'decision'];
      }
    }

    const disputeRecords = await this.disputes.listByRequest(q, record.id);
    const ownDispute = disputeRecords.some((d) => d.openedBy === viewerId);
    // Un vencimiento aún no persistido se considera cerrado en el instante del plazo.
    const finalAt =
      record.finalAt ??
      (stored !== status
        ? stored === 'abierta'
          ? record.openDeadlineAt
          : stored === 'esperando_pago'
            ? record.payDeadlineAt
            : record.decisionDeadlineAt
        : null);
    const eligibility = disputeEligibility({
      role,
      request: {
        status,
        paymentReported: record.proofUploadedAt !== null,
        finalReason: effective.reason,
        finalAt,
        rejectedAsFalse: record.rejectedAsFalse,
        ownDisputeOpen: ownDispute,
      },
      now,
    });
    const canRespond = (d: DisputeRecord): boolean =>
      d.accusedId === viewerId && d.status === 'abierto' && d.respondedAt === null;

    const timeline = withTimeline
      ? (await this.events.listByRequest(q, record.id)).map((e) => ({
          type: e.type,
          actor: e.actorId ? { userId: e.actorId, fullName: e.actorName ?? '' } : null,
          fromStatus: e.fromStatus,
          toStatus: e.toStatus,
          reason: e.reason,
          occurredAt: e.occurredAt.toISOString(),
        }))
      : [];

    const quoted = record.quoteAmountCents !== null;
    return {
      id: record.id,
      group: {
        id: group.id,
        name: group.name,
        serviceName: group.service_name_snapshot,
        planName: group.plan_name_snapshot,
        logoUrl: group.logo_url_snapshot,
        brandColor: group.brand_color_snapshot,
        billingDay: group.billing_day,
      },
      applicant: person(record.applicantId),
      host: person(group.owner_id),
      source: record.source,
      phase: {
        status,
        deadlineAt: iso(deadlineAt),
        deadlineKind,
        serverNow: now.toISOString(),
      },
      openedAt: record.openedAt.toISOString(),
      estimatedShareCents: quoteEntryShare(Number(group.total_bs_cents), ctx.members),
      quote: quoted
        ? {
            amountCents: record.quoteAmountCents as number,
            priceCents: record.quotePriceCents as number,
            currency: record.quoteCurrency as string,
            exchangeRate: record.quoteExchangeRate,
            totalBsCents: record.quoteTotalBsCents as number,
            memberCount: record.quoteMemberCount as number,
          }
        : null,
      paymentInfo:
        record.paymentSentAt === null
          ? null
          : {
              text: record.paymentText,
              qrAvailable: record.paymentQrKey !== null && record.contentPurgedAt === null,
            },
      extended: record.extendedAt !== null,
      proof:
        record.proofUploadedAt === null
          ? null
          : {
              method: record.proofMethod,
              reference: record.proofReference,
              mime: record.proofMime,
              sizeBytes: record.proofSizeBytes,
              uploadedAt: iso(record.proofUploadedAt),
              fileAvailable: record.proofKey !== null && record.contentPurgedAt === null,
            },
      entryWindow: {
        isOpen: window.isOpen,
        opensAt: iso(window.opensAt),
        closesAt: iso(window.closesAt),
      },
      finalReason: status === stored ? record.finalReason : effective.reason,
      rejectReason: record.rejectReason,
      rejectedAsFalse: record.rejectedAsFalse,
      acceptedMethod: record.acceptedMethod,
      chargeId: record.chargeId,
      unreadCount: await this.messages.unreadCount(q, record.id, viewerId),
      disputes: disputeRecords.map((d) => ({
        id: d.id,
        kind: d.kind,
        status: d.status,
        openedByMe: d.openedBy === viewerId,
        canRespond: canRespond(d),
      })),
      canOpenDispute: eligibility.ok
        ? { kind: eligibility.kind, closesAt: eligibility.closesAt.toISOString() }
        : null,
      allowedActions: allowedActions({
        role,
        status,
        extended: record.extendedAt !== null,
        windowOpen: window.isOpen,
        slotAvailable: slots > 0,
        canOpenDispute: eligibility.ok,
        canRespondDispute: disputeRecords.some(canRespond),
      }),
      timeline,
      version: record.version,
    };
  }

  private async groupContext(
    q: Queryable,
    groupId: string,
    now: Date,
    cache: Map<string, GroupContext>,
  ): Promise<GroupContext> {
    const cached = cache.get(groupId);
    if (cached) return cached;
    const group = (await this.groups.findById(q, groupId)) as GroupRow;
    const ctx = {
      group,
      members: await this.members.countActive(q, groupId),
      reserved: await this.requests.countReserved(q, groupId, now),
    };
    cache.set(groupId, ctx);
    return ctx;
  }
}
