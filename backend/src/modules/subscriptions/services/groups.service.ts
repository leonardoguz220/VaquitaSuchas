import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { Clock } from '../../../shared/clock/clock.js';
import { DbService, type DbTransaction, type Queryable } from '../../../shared/db/db.service.js';
import { DomainError } from '../../../shared/errors/domain-error.js';
import { DEFAULT_MESSAGES, ErrorCode } from '../../../shared/errors/error-codes.js';
import type { GroupCreated } from '../../../shared/events/group-events.js';
import { TxEventBus } from '../../../shared/events/tx-event-bus.js';
import { CatalogService } from '../../catalog/services/catalog.service.js';
import { buildBreakdown, buildGroupDetail, type GroupDetail } from '../domain/group-detail.js';
import {
  MAX_ACTIVE_OWNED_GROUPS,
  MAX_SLOTS,
  MIN_SLOTS,
  validateGroupInput,
  type GroupInput,
  type GroupRule,
} from '../domain/group-rules.js';
import { applyGroupPatch, type GroupPatch } from '../domain/group-edit.js';
import { generateInviteCode } from '../domain/invite-code.js';
import type { Currency } from '../domain/money.js';
import {
  HOST_ELIGIBILITY_PORT,
  type HostEligibility,
  type HostEligibilityPort,
} from '../ports/host-eligibility.port.js';
import { GroupsRepository, type GroupRow } from '../repositories/groups.repository.js';
import { MembersRepository } from '../repositories/members.repository.js';
import { assertGroupWritable, fieldsError } from './group-errors.js';
import { PaymentInfoService } from './payment-info.service.js';

export const INVITE_CODE_ATTEMPTS = 5;

export interface CreateGroupInput {
  catalogPlanSlug: string | null;
  customServiceName: string | null;
  name: string;
  priceCents: number;
  currency: Currency;
  exchangeRate: string | null;
  billingDay: number;
  totalSlots: number;
  paymentInfoText: string | null;
}

export interface QuoteInput {
  priceCents: number;
  currency: Currency;
  exchangeRate: string | null;
  memberCount: number;
}

export interface HostEligibilityView extends HostEligibility {
  activeGroups: number;
  maxActiveGroups: number;
  canCreateMore: boolean;
}

const businessRule = (
  rule: string,
  message: string,
  extra?: Record<string, unknown>,
): DomainError => new DomainError(ErrorCode.BUSINESS_RULE, 422, message, { rule, ...extra });

/** Reglas de `validateGroupInput` que son error de campo (400) y no de negocio (422). */
function fieldErrors(broken: GroupRule[]): Record<string, string[]> {
  const fields: Record<string, string[]> = {};
  if (broken.includes('exchange_rate_required'))
    fields['exchangeRate'] = ['EXCHANGE_RATE_REQUIRED'];
  if (broken.includes('exchange_rate_not_allowed')) {
    fields['exchangeRate'] = ['EXCHANGE_RATE_NOT_ALLOWED'];
  }
  if (broken.includes('billing_day_range')) fields['billingDay'] = ['BILLING_DAY_OUT_OF_RANGE'];
  return fields;
}

@Injectable()
export class GroupsService {
  constructor(
    private readonly db: DbService,
    private readonly clock: Clock,
    private readonly bus: TxEventBus,
    private readonly groups: GroupsRepository,
    private readonly members: MembersRepository,
    private readonly catalog: CatalogService,
    private readonly paymentInfo: PaymentInfoService,
    @Inject(HOST_ELIGIBILITY_PORT) private readonly eligibility: HostEligibilityPort,
  ) {}

  /** `GET /users/me/host-eligibility` (RF-001-21). */
  async hostEligibility(userId: string): Promise<HostEligibilityView> {
    const eligibility = await this.eligibility.check(this.db, userId);
    const activeGroups = await this.groups.countActiveOwned(this.db, userId);
    return {
      ...eligibility,
      activeGroups,
      maxActiveGroups: MAX_ACTIVE_OWNED_GROUPS,
      canCreateMore: activeGroups < MAX_ACTIVE_OWNED_GROUPS,
    };
  }

  /** `POST /groups/quote`: total en Bs y cuotas con las funciones puras, sin efectos (RF-001-04). */
  quote(input: QuoteInput) {
    const broken = validateGroupInput({
      priceCents: input.priceCents,
      currency: input.currency,
      exchangeRate: input.exchangeRate,
      // `memberCount` hace de cupos; el mínimo de 2 de un grupo no aplica a una cotización de 1.
      totalSlots: Math.max(2, input.memberCount),
      billingDay: 1,
    });
    const fields = fieldErrors(broken);
    if (broken.includes('price_range')) fields['priceCents'] = ['PRICE_OUT_OF_RANGE'];
    if (input.memberCount > MAX_SLOTS) fields['memberCount'] = ['MEMBER_COUNT_OUT_OF_RANGE'];
    if (Object.keys(fields).length > 0) throw fieldsError(fields);
    const { totalBsCents, baseShareCents, ownerShareCents, remainderCents } = buildBreakdown(
      { priceCents: input.priceCents, currency: input.currency, exchangeRate: input.exchangeRate },
      input.memberCount,
    );
    return { totalBsCents, baseShareCents, ownerShareCents, remainderCents };
  }

  /**
   * `POST /groups` (RF-001-01 a 05) en una sola transacción: elegibilidad, tope de 5 grupos, copia
   * del catálogo, validación, código de invitación, grupo + fila de titular y evento `GroupCreated`
   * (que genera el ciclo inicial, spec 002).
   */
  async create(userId: string, input: CreateGroupInput): Promise<GroupDetail> {
    const hasPlan = input.catalogPlanSlug !== null;
    const hasCustom = input.customServiceName !== null;
    if (hasPlan === hasCustom) {
      const code = hasPlan ? 'ONLY_ONE_ALLOWED' : 'ONE_REQUIRED';
      throw fieldsError({ catalogPlanSlug: [code], customServiceName: [code] });
    }

    return this.db.withTransaction(async (tx) => {
      const eligibility = await this.eligibility.check(tx, userId);
      if (!eligibility.eligible) {
        throw new DomainError(
          'NOT_HOST_ELIGIBLE',
          422,
          'Aún no estás habilitado para crear una suscripción como titular.',
          { rule: 'RF-001-21', ...eligibility },
        );
      }

      // Serializa las altas del mismo titular: contar y luego insertar no tiene carrera (CA-001-28).
      await this.groups.lockOwner(tx, userId);
      if ((await this.groups.countActiveOwned(tx, userId)) >= MAX_ACTIVE_OWNED_GROUPS) {
        throw new DomainError(
          'TOO_MANY_ACTIVE_GROUPS',
          422,
          `Ya tienes ${MAX_ACTIVE_OWNED_GROUPS} grupos activos como titular.`,
          { rule: 'RN-001-14', maxActiveGroups: MAX_ACTIVE_OWNED_GROUPS },
        );
      }

      const planCopy = input.catalogPlanSlug
        ? await this.catalog.getActivePlanForSubscription(input.catalogPlanSlug)
        : null;
      if (input.catalogPlanSlug && !planCopy) {
        throw new DomainError(ErrorCode.NOT_FOUND, 404, DEFAULT_MESSAGES.NOT_FOUND);
      }

      this.assertValid(
        {
          priceCents: input.priceCents,
          currency: input.currency,
          exchangeRate: input.exchangeRate,
          totalSlots: input.totalSlots,
          billingDay: input.billingDay,
        },
        planCopy ? planCopy.plan.maxSlots : null,
      );

      const inviteCode = await this.freshInviteCode(tx);
      const individual = planCopy?.plan.individualPriceCents ?? null;
      const group = await this.groups.insert(tx, {
        ownerId: userId,
        name: input.name,
        serviceName: planCopy ? planCopy.service.name : (input.customServiceName as string),
        planName: planCopy?.plan.name ?? null,
        catalogPlanId: planCopy?.plan.id ?? null,
        planMaxSlots: planCopy?.plan.maxSlots ?? null,
        logoUrl: planCopy?.service.logoUrl ?? null,
        brandColor: planCopy?.service.brandColor ?? null,
        individualPriceCents: individual,
        individualPriceCurrency: individual === null ? null : (planCopy?.plan.currency ?? null),
        paymentInfoText: input.paymentInfoText,
        priceCents: input.priceCents,
        currency: input.currency,
        exchangeRate: input.currency === 'USD' ? input.exchangeRate : null,
        billingDay: input.billingDay,
        totalSlots: input.totalSlots,
        inviteCode,
      });
      await this.members.insert(tx, {
        groupId: group.id,
        userId,
        role: 'titular',
        joinSource: 'creacion',
      });
      const event: GroupCreated = { type: 'groups.created', groupId: group.id, ownerId: userId };
      await this.bus.publish(tx, event);
      return this.detailFor(tx, group, 'titular');
    });
  }

  /**
   * `PATCH /groups/:id` (RF-001-14, RF-001-09): edita nombre, precio, moneda, tipo de cambio, día de
   * cobro, cupos y recepción de miembros. Bloquea la fila; rechaza un grupo cerrado o congelado y una
   * `version` vieja (409 `STALE_STATE`). Los cobros y las solicitudes llevan su propia copia, así que
   * no se tocan (RN-001-03); el nuevo `billing_day` rige desde el siguiente corte porque el corte
   * vigente se deriva del último ciclo generado (data-model.md §2).
   */
  async update(groupId: string, input: GroupPatch & { version?: number }): Promise<GroupDetail> {
    return this.db.withTransaction(async (tx) => {
      const group = await this.groups.findByIdForUpdate(tx, groupId);
      if (!group) throw new DomainError(ErrorCode.NOT_FOUND, 404, DEFAULT_MESSAGES.NOT_FOUND);
      assertGroupWritable(group);
      if (input.version !== undefined && input.version !== group.version) {
        throw new DomainError(
          'STALE_STATE',
          409,
          'Otra persona modificó el grupo. Recárgalo e intenta de nuevo.',
          { currentVersion: group.version },
        );
      }

      const merged = applyGroupPatch(
        {
          name: group.name,
          priceCents: Number(group.price_cents),
          currency: group.currency,
          exchangeRate: group.exchange_rate,
          billingDay: group.billing_day,
          totalSlots: group.total_slots,
          acceptingMembers: group.accepting_members,
        },
        input,
      );
      const activeMembers = await this.members.countActive(tx, groupId);
      this.assertValid(merged, group.plan_max_slots_snapshot, activeMembers);
      const updated = await this.groups.update(tx, groupId, merged);
      return this.detailFor(tx, updated, 'titular');
    });
  }

  /** `GroupDetail` de un miembro activo; quien no lo es recibe 404 (RNF-001-01). */
  async detail(q: DbTransaction, groupId: string, viewerId: string): Promise<GroupDetail> {
    const group = await this.groups.findById(q, groupId);
    const member = group ? await this.members.findActive(q, groupId, viewerId) : null;
    if (!group || !member) {
      throw new DomainError(ErrorCode.NOT_FOUND, 404, DEFAULT_MESSAGES.NOT_FOUND);
    }
    return this.detailFor(q, group, member.role);
  }

  /**
   * Valida precio, moneda, cupos y día de cobro: campos mal formados → 400; cupos bajo los miembros
   * activos → `SLOTS_BELOW_MEMBERS`; cupos sobre el plan → RN-001-13; el resto → RN-001-09.
   */
  private assertValid(
    input: GroupInput,
    planMaxSlots: number | null,
    activeMembers?: number,
  ): void {
    const broken = validateGroupInput(
      input,
      planMaxSlots === null ? undefined : { maxSlots: planMaxSlots },
    );
    const fields = fieldErrors(broken);
    if (Object.keys(fields).length > 0) throw fieldsError(fields);
    if (activeMembers !== undefined && input.totalSlots < activeMembers) {
      throw new DomainError(
        'SLOTS_BELOW_MEMBERS',
        422,
        `Los cupos no pueden ser menos que los miembros actuales (${activeMembers}).`,
        { rule: 'RF-001-14', minSlots: Math.max(activeMembers, MIN_SLOTS) },
      );
    }
    if (broken.includes('slots_exceed_plan') && planMaxSlots !== null) {
      throw businessRule('RN-001-13', 'Los cupos superan los que permite el plan.', {
        maxSlots: planMaxSlots,
      });
    }
    if (broken.length > 0) {
      throw businessRule(
        'RN-001-09',
        'El precio o los cupos están fuera de los límites permitidos.',
      );
    }
  }

  /** Código único: hasta 5 intentos ante una colisión (RF-001-06). */
  private async freshInviteCode(q: Queryable): Promise<string> {
    for (let attempt = 0; attempt < INVITE_CODE_ATTEMPTS; attempt++) {
      const code = generateInviteCode((size) => randomBytes(size));
      if (!(await this.groups.findByInviteCode(q, code))) return code;
    }
    throw new DomainError(
      ErrorCode.SERVICE_UNAVAILABLE,
      503,
      'No pudimos generar el código de invitación. Intenta de nuevo.',
    );
  }

  /** `GroupDetail` para quien consulta; la URL del QR se firma al consultar. */
  private async detailFor(
    q: DbTransaction,
    group: GroupRow,
    viewerRole: 'titular' | 'miembro',
  ): Promise<GroupDetail> {
    const members = await this.members.listActiveDetailed(q, group.id);
    return buildGroupDetail({
      group: {
        id: group.id,
        name: group.name,
        status: group.status,
        frozenReason: group.frozen_reason,
        createdAt: group.created_at,
        serviceName: group.service_name_snapshot,
        planName: group.plan_name_snapshot,
        catalogPlanId: group.catalog_plan_id,
        logoUrl: group.logo_url_snapshot,
        brandColor: group.brand_color_snapshot,
        billingDay: group.billing_day,
        totalSlots: group.total_slots,
        priceCents: Number(group.price_cents),
        currency: group.currency,
        exchangeRate: group.exchange_rate,
        acceptingMembers: group.accepting_members,
        paymentInfoText: group.payment_info_text,
        inviteCode: group.invite_code,
        version: group.version,
      },
      members: members.map((m) => ({
        userId: m.user_id,
        fullName: m.full_name,
        role: m.role,
        phone: m.phone_e164,
        joinedAt: m.joined_at,
      })),
      viewerRole,
      paymentQrUrl: await this.paymentInfo.qrUrl(group),
      now: this.clock.now(),
    });
  }
}
