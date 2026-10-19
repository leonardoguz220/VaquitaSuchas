import { entryWindow } from './entry-window.js';
import { computeTotalBsCents, type Currency } from './money.js';
import { splitShares } from './shares.js';

export interface GroupDetailSource {
  id: string;
  name: string;
  status: 'activo' | 'cerrado';
  frozenReason: 'titular_baneado' | null;
  createdAt: Date;
  serviceName: string;
  planName: string | null;
  catalogPlanId: string | null;
  logoUrl: string | null;
  brandColor: string | null;
  billingDay: number;
  totalSlots: number;
  priceCents: number;
  currency: Currency;
  exchangeRate: string | null;
  acceptingMembers: boolean;
  paymentInfoText: string | null;
  inviteCode: string;
  version: number;
}

export interface GroupDetailMember {
  userId: string;
  fullName: string;
  role: 'titular' | 'miembro';
  phone: string | null;
  joinedAt: Date;
}

export interface Breakdown {
  priceCents: number;
  currency: Currency;
  exchangeRate: string | null;
  totalBsCents: number;
  memberCount: number;
  baseShareCents: number;
  ownerShareCents: number;
  remainderCents: number;
}

/** Desglose de la cuota con las funciones puras de dinero (RF-001-13); el frontend no calcula. */
export function buildBreakdown(
  group: Pick<GroupDetailSource, 'priceCents' | 'currency' | 'exchangeRate'>,
  memberCount: number,
): Breakdown {
  const totalBsCents = computeTotalBsCents(group.currency, group.priceCents, group.exchangeRate);
  const shares = splitShares(totalBsCents, Math.max(1, memberCount));
  return {
    priceCents: group.priceCents,
    currency: group.currency,
    exchangeRate: group.exchangeRate,
    totalBsCents,
    memberCount,
    ...shares,
  };
}

/**
 * `GroupDetail` de `contracts/api.md` (spec 001). `paymentQrUrl` ya viene firmada (o `null`);
 * `inviteCode` solo lo ve el titular (RF-001-06).
 */
export function buildGroupDetail(input: {
  group: GroupDetailSource;
  members: GroupDetailMember[];
  viewerRole: 'titular' | 'miembro';
  paymentQrUrl: string | null;
  /** Hay un QR guardado aunque su URL no se haya podido firmar; por omisión, si hay URL. */
  hasPaymentQr?: boolean;
  now: Date;
}) {
  const { group, members, viewerRole, paymentQrUrl, now } = input;
  const hasQr = input.hasPaymentQr ?? paymentQrUrl !== null;
  const breakdown = buildBreakdown(group, members.length);
  const window = entryWindow({ billingDay: group.billingDay, createdAt: group.createdAt }, now);
  return {
    id: group.id,
    name: group.name,
    status: group.status,
    frozenReason: group.frozenReason,
    createdAt: group.createdAt.toISOString(),
    service: {
      name: group.serviceName,
      planName: group.planName,
      logoUrl: group.logoUrl,
      brandColor: group.brandColor,
      isCustom: group.catalogPlanId === null,
    },
    billingDay: group.billingDay,
    totalSlots: group.totalSlots,
    priceCents: group.priceCents,
    currency: group.currency,
    exchangeRate: group.exchangeRate,
    breakdown,
    myShareCents: viewerRole === 'titular' ? breakdown.ownerShareCents : breakdown.baseShareCents,
    myRole: viewerRole,
    entryWindow: {
      isOpen: window.isOpen,
      opensAt: window.opensAt?.toISOString() ?? null,
      closesAt: window.closesAt?.toISOString() ?? null,
      acceptingMembers: group.acceptingMembers,
    },
    members: members.map((m) => ({
      userId: m.userId,
      fullName: m.fullName,
      role: m.role,
      phone: m.phone,
      joinedAt: m.joinedAt.toISOString(),
    })),
    paymentInfo: {
      text: group.paymentInfoText,
      qrUrl: paymentQrUrl,
      configured: group.paymentInfoText !== null || hasQr,
    },
    ...(viewerRole === 'titular' ? { inviteCode: group.inviteCode } : {}),
    version: group.version,
  };
}

export type GroupDetail = ReturnType<typeof buildGroupDetail>;
