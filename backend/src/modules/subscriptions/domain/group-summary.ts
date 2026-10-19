import { nextCutAfter } from './billing-calendar.js';
import { computeTotalBsCents, type Currency } from './money.js';
import { splitShares } from './shares.js';

export interface GroupSummarySource {
  id: string;
  name: string;
  serviceName: string;
  logoUrl: string | null;
  brandColor: string | null;
  status: 'activo' | 'cerrado';
  frozenReason: 'titular_baneado' | null;
  totalSlots: number;
  billingDay: number;
  priceCents: number;
  currency: Currency;
  exchangeRate: string | null;
}

const pad = (n: number, size: number): string => String(n).padStart(size, '0');

/**
 * `GroupSummary` de `contracts/api.md` (RF-001-19). El titular ve su cuota como referencia (RN-001-10):
 * base + resto; el miembro, la base. El frontend no calcula nada.
 */
export function buildGroupSummary(input: {
  group: GroupSummarySource;
  role: 'titular' | 'miembro';
  memberCount: number;
  now: Date;
}) {
  const { group, role, memberCount, now } = input;
  const total = computeTotalBsCents(group.currency, group.priceCents, group.exchangeRate);
  const shares = splitShares(total, Math.max(1, memberCount));
  const cut = nextCutAfter(now, group.billingDay);
  return {
    id: group.id,
    name: group.name,
    serviceName: group.serviceName,
    logoUrl: group.logoUrl,
    brandColor: group.brandColor,
    role,
    status: group.status,
    frozenReason: group.frozenReason,
    memberCount,
    totalSlots: group.totalSlots,
    myShareCents: role === 'titular' ? shares.ownerShareCents : shares.baseShareCents,
    myShareIsReference: role === 'titular',
    billingDay: group.billingDay,
    nextCutDate: `${pad(cut.year, 4)}-${pad(cut.month, 2)}-${pad(cut.day, 2)}`,
  };
}

export type GroupSummary = ReturnType<typeof buildGroupSummary>;
