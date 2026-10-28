/**
 * Cliente del faltante de grupo (`specs/011-faltante-de-grupo/contracts/api.md`). Todas las
 * funciones llaman al backend por el proxy `/api`. El frontend no calcula montos ni estados: usa
 * los campos `...Cents`, los estados y `allowedActions` que entrega la API.
 */
import { apiRequest } from './http';

export type RoundStatus = 'abierta' | 'cerrada' | 'cancelada';
export type ShortfallChoice = 'pendiente' | 'cubrir' | 'devolucion' | 'sin_respuesta';
export type ExtraStatus = 'no_aplica' | 'pendiente_pago' | 'informado' | 'confirmado' | 'vencido';
export type RefundStatus = 'no_aplica' | 'pendiente' | 'enviada' | 'confirmada' | 'disputada';
export type PaymentMethod = 'qr' | 'transferencia';
export type RefundMethod = 'qr' | 'transferencia' | 'efectivo';

export type RowAction =
  | 'cover'
  | 'requestRefund'
  | 'pay'
  | 'confirmPayment'
  | 'rejectPayment'
  | 'sendRefund'
  | 'confirmRefund'
  | 'disputeRefund';

export interface ShortfallPerson {
  userId: string;
  fullName: string;
}

export interface ShortfallQuote {
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

export interface ShortfallTimelineEntry {
  type: string;
  actor: ShortfallPerson | null;
  reason: string | null;
  occurredAt: string;
}

export interface ShortfallRow {
  id: string;
  roundId: string;
  groupId: string;
  member: ShortfallPerson;
  paidCents: number;
  extraDueCents: number;
  choice: ShortfallChoice;
  extra: {
    status: ExtraStatus;
    method: PaymentMethod | null;
    reference: string | null;
    deadlineAt: string | null;
    rejectReason: string | null;
  };
  refund: {
    status: RefundStatus;
    amountCents: number | null;
    method: RefundMethod | null;
    reference: string | null;
    dueAt: string | null;
    disputeReason: string | null;
  };
  version: number;
  allowedActions: RowAction[];
  timeline: ShortfallTimelineEntry[];
}

export interface ShortfallRound {
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
  rows: ShortfallRow[];
  allowedActions: 'cancel'[];
}

export interface MyShortfall {
  groupId: string;
  groupName: string;
  round: Pick<ShortfallRound, 'id' | 'period' | 'status' | 'respondBy' | 'payBy'>;
  row: ShortfallRow;
}

const groupPath = (groupId: string): string => `/api/groups/${groupId}/shortfall`;
const rowPath = (rowId: string): string => `/api/shortfall-rows/${rowId}`;

/** `GET /groups/:groupId/shortfall/preview` (titular; RF-011-01). `403` si no es el titular. */
export function getShortfallPreview(
  groupId: string,
  signal?: AbortSignal,
): Promise<ShortfallQuote> {
  return apiRequest<ShortfallQuote>(`${groupPath(groupId)}/preview`, { signal });
}

/** `POST /groups/:groupId/shortfall` (titular; RF-011-04). */
export function openShortfallRound(groupId: string): Promise<ShortfallRound> {
  return apiRequest<ShortfallRound>(groupPath(groupId), { method: 'POST', body: {} });
}

/** `GET /groups/:groupId/shortfall`: la ronda abierta o la última; `null` si nunca hubo una. */
export function getCurrentShortfall(
  groupId: string,
  signal?: AbortSignal,
): Promise<ShortfallRound | null> {
  return apiRequest<ShortfallRound | null>(groupPath(groupId), { signal });
}

/** `POST /shortfall-rounds/:roundId/cancel` (titular; RF-011-06). */
export function cancelShortfallRound(roundId: string): Promise<ShortfallRound> {
  return apiRequest<ShortfallRound>(`/api/shortfall-rounds/${roundId}/cancel`, {
    method: 'POST',
    body: {},
  });
}

/** `GET /me/shortfalls` (HU-011-02). */
export function listMyShortfalls(signal?: AbortSignal): Promise<MyShortfall[]> {
  return apiRequest<MyShortfall[]>('/api/me/shortfalls', { signal });
}

interface Versioned {
  version?: number;
}

/** `POST /shortfall-rows/:rowId/respond` (afectado; RF-011-08 y 09). */
export function respondToShortfall(
  rowId: string,
  body: { choice: 'cubrir' | 'devolucion' } & Versioned,
): Promise<ShortfallRow> {
  return apiRequest<ShortfallRow>(`${rowPath(rowId)}/respond`, { method: 'POST', body });
}

/** `POST /shortfall-rows/:rowId/pay` (afectado; RF-011-10). */
export function payShortfallExtra(
  rowId: string,
  body: { method: PaymentMethod; reference: string } & Versioned,
): Promise<ShortfallRow> {
  return apiRequest<ShortfallRow>(`${rowPath(rowId)}/pay`, { method: 'POST', body });
}

/** `POST /shortfall-rows/:rowId/confirm-payment` (titular). */
export function confirmShortfallPayment(rowId: string, body: Versioned): Promise<ShortfallRow> {
  return apiRequest<ShortfallRow>(`${rowPath(rowId)}/confirm-payment`, { method: 'POST', body });
}

/** `POST /shortfall-rows/:rowId/reject-payment` (titular). */
export function rejectShortfallPayment(
  rowId: string,
  body: { reason: string } & Versioned,
): Promise<ShortfallRow> {
  return apiRequest<ShortfallRow>(`${rowPath(rowId)}/reject-payment`, { method: 'POST', body });
}

/** `POST /shortfall-rows/:rowId/refund` (titular; RF-011-12). */
export function sendShortfallRefund(
  rowId: string,
  body: { method: RefundMethod; reference: string } & Versioned,
): Promise<ShortfallRow> {
  return apiRequest<ShortfallRow>(`${rowPath(rowId)}/refund`, { method: 'POST', body });
}

/** `POST /shortfall-rows/:rowId/refund/confirm` (afectado). */
export function confirmShortfallRefund(rowId: string, body: Versioned): Promise<ShortfallRow> {
  return apiRequest<ShortfallRow>(`${rowPath(rowId)}/refund/confirm`, { method: 'POST', body });
}

/** `POST /shortfall-rows/:rowId/refund/dispute` (afectado; RF-011-13). */
export function disputeShortfallRefund(
  rowId: string,
  body: { reason: string } & Versioned,
): Promise<ShortfallRow> {
  return apiRequest<ShortfallRow>(`${rowPath(rowId)}/refund/dispute`, { method: 'POST', body });
}
