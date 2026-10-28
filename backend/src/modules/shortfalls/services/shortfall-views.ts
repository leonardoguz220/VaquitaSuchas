import type { RowViewAction } from '../domain/allowed-actions.js';
import type { Choice, ExtraStatus, RefundStatus, RoundStatus } from '../domain/state.js';
import type { ShortfallEventType } from '../repositories/shortfalls.repository.js';

export interface PersonRef {
  userId: string;
  fullName: string;
}

export interface ShortfallQuoteView {
  groupId: string;
  cycleId: string;
  period: string;
  totalBsCents: number;
  memberCountAfter: number;
  baseShareCents: number;
  ownerShareCents: number;
  shortfallCents: number;
  rows: { userId: string; fullName: string; paidCents: number; extraDueCents: number }[];
}

export interface TimelineEntryView {
  type: ShortfallEventType;
  actor: PersonRef | null;
  reason: string | null;
  occurredAt: string;
}

export interface ShortfallRowView {
  id: string;
  roundId: string;
  groupId: string;
  member: PersonRef;
  paidCents: number;
  extraDueCents: number;
  choice: Choice;
  extra: {
    status: ExtraStatus;
    method: 'qr' | 'transferencia' | null;
    reference: string | null;
    deadlineAt: string | null;
    rejectReason: string | null;
  };
  refund: {
    status: RefundStatus;
    amountCents: number | null;
    method: 'qr' | 'transferencia' | 'efectivo' | null;
    reference: string | null;
    dueAt: string | null;
    disputeReason: string | null;
  };
  version: number;
  allowedActions: RowViewAction[];
  timeline: TimelineEntryView[];
}

export interface ShortfallRoundView {
  id: string;
  groupId: string;
  period: string;
  roundNumber: number;
  status: RoundStatus;
  totalBsCents: number;
  memberCountAfter: number;
  baseShareCents: number;
  ownerShareCents: number;
  shortfallCents: number;
  openedAt: string;
  respondBy: string;
  payBy: string;
  closedAt: string | null;
  version: number;
  rows: ShortfallRowView[];
  allowedActions: 'cancel'[];
}

export interface MyShortfallView {
  groupId: string;
  groupName: string;
  round: Pick<ShortfallRoundView, 'id' | 'period' | 'status' | 'respondBy' | 'payBy'>;
  row: ShortfallRowView;
}
