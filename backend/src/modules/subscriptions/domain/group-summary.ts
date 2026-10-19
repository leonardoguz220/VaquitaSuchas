import { nextCutAfter, type LaPazDate } from './billing-calendar.js';
import { buildBreakdown } from './group-detail.js';
import type { Currency } from './money.js';

export interface GroupSummarySource {
  id: string;
  name: string;
  status: 'activo' | 'cerrado';
  frozenReason: 'titular_baneado' | null;
  serviceName: string;
  logoUrl: string | null;
  brandColor: string | null;
  totalSlots: number;
  priceCents: number;
  currency: Currency;
  exchangeRate: string | null;
  billingDay: number;
  memberCount: number;
  role: 'titular' | 'miembro';
}

const formatDate = (d: LaPazDate): string =>
  `${String(d.year).padStart(4, '0')}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;

/**
 * `GroupSummary` de «Mis suscripciones» (RF-001-19): la cuota sale de las funciones puras de
 * dinero. El titular no genera cobro propio: su cuota es solo de referencia (RN-001-10).
 */
export function buildGroupSummary(group: GroupSummarySource, now: Date) {
  const breakdown = buildBreakdown(group, group.memberCount);
  const isOwner = group.role === 'titular';
  return {
    id: group.id,
    name: group.name,
    serviceName: group.serviceName,
    logoUrl: group.logoUrl,
    brandColor: group.brandColor,
    role: group.role,
    status: group.status,
    frozenReason: group.frozenReason,
    memberCount: group.memberCount,
    totalSlots: group.totalSlots,
    myShareCents: isOwner ? breakdown.ownerShareCents : breakdown.baseShareCents,
    myShareIsReference: isOwner,
    billingDay: group.billingDay,
    nextCutDate: formatDate(nextCutAfter(now, group.billingDay)),
  };
}

export type GroupSummary = ReturnType<typeof buildGroupSummary>;

export interface GroupPageCursor {
  createdAt: Date;
  id: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Cursor opaco `base64url(<fecha ISO>|<id>)` de la paginación por (created_at, id). */
export function encodeGroupCursor(cursor: GroupPageCursor): string {
  return Buffer.from(`${cursor.createdAt.toISOString()}|${cursor.id}`, 'utf8').toString(
    'base64url',
  );
}

/** `null` si el cursor está mal formado. */
export function decodeGroupCursor(raw: string): GroupPageCursor | null {
  const [iso, id, ...rest] = Buffer.from(raw, 'base64url').toString('utf8').split('|');
  if (rest.length > 0 || !iso || !id || !UUID.test(id)) return null;
  const createdAt = new Date(iso);
  if (Number.isNaN(createdAt.getTime()) || createdAt.toISOString() !== iso) return null;
  return { createdAt, id };
}
