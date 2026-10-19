import { allowedActions, groupStateOf, type ChargeAccess } from '../domain/access.js';
import type { ChargeEventRecord } from '../repositories/events.repository.js';
import type { GroupBrief } from '../repositories/charge-read.repository.js';
import type { ChargeRecord } from '../repositories/charges.repository.js';
import type { ReceiptRecord } from '../repositories/receipts.repository.js';
import type { ChargeEventView, ChargeView, PersonRef, ReceiptView } from './charge-views.js';

export interface ChargeViewInput {
  charge: ChargeRecord;
  group: GroupBrief;
  access: ChargeAccess;
  /** El dueño del cobro sigue siendo miembro activo del grupo. */
  memberActive: boolean;
  events: readonly ChargeEventRecord[];
  receipts: readonly ReceiptRecord[];
  names: ReadonlyMap<string, string>;
  /** URL firmada del QR de pago del grupo, si hay y si aplica. */
  qrUrl: string | null;
}

const iso = (date: Date | null): string | null => (date ? date.toISOString() : null);

export function personRef(userId: string, names: ReadonlyMap<string, string>): PersonRef {
  return { userId, fullName: names.get(userId) ?? '' };
}

/** Ids de personas que aparecen en la vista, para pedir sus nombres de una vez. */
export function personIdsOf(
  charge: ChargeRecord,
  events: readonly ChargeEventRecord[],
  receipts: readonly ReceiptRecord[],
): string[] {
  const ids = new Set<string>([charge.userId]);
  if (charge.settledBy) ids.add(charge.settledBy);
  for (const event of events) if (event.actorId) ids.add(event.actorId);
  for (const receipt of receipts) ids.add(receipt.uploadedBy);
  return [...ids];
}

function receiptView(receipt: ReceiptRecord, names: ReadonlyMap<string, string>): ReceiptView {
  return {
    id: receipt.id,
    uploadedAt: receipt.uploadedAt.toISOString(),
    uploadedBy: personRef(receipt.uploadedBy, names),
    method: receipt.method,
    reference: receipt.reference,
    mime: receipt.mime,
    sizeBytes: receipt.sizeBytes,
    status: receipt.status,
    fileAvailable: receipt.fileDeletedAt === null,
  };
}

function eventView(event: ChargeEventRecord, names: ReadonlyMap<string, string>): ChargeEventView {
  return {
    id: event.id,
    type: event.type,
    actor: event.actorId ? personRef(event.actorId, names) : null,
    fromStatus: event.fromStatus,
    toStatus: event.toStatus,
    reason: event.reason,
    metadata: event.metadata,
    occurredAt: event.occurredAt.toISOString(),
  };
}

/**
 * Arma el `Charge` completo que ven el titular y el dueño (RNF-002-07: los demás miembros nunca
 * reciben esta vista). `allowedActions` sale del dominio: el frontend no decide.
 */
export function presentCharge(input: ChargeViewInput): ChargeView {
  const { charge, group, access, names } = input;
  const receipts = input.receipts.map((r) => receiptView(r, names));
  const rejection = [...input.events].reverse().find((e) => e.type === 'rechazado');
  const isPayer = access === 'dueno' || access === 'dueno_retirado';
  const open = charge.status === 'pendiente' || charge.status === 'atrasado';
  const configured = group.paymentInfoText !== null || group.paymentQrKey !== null;

  return {
    id: charge.id,
    groupId: charge.groupId,
    period: charge.period,
    origin: charge.origin,
    member: { ...personRef(charge.userId, names), isFormerMember: !input.memberActive },
    amountCents: charge.amountCents,
    status: charge.status,
    dueAt: charge.dueAt.toISOString(),
    paidAt: iso(charge.paidAt),
    cycleId: charge.cycleId,
    issuedAt: charge.issuedAt.toISOString(),
    firstSubmittedAt: iso(charge.firstSubmittedAt),
    priceCents: charge.priceCents,
    currency: charge.currency,
    exchangeRate: charge.exchangeRate,
    totalBsCents: charge.totalBsCents,
    memberCount: charge.memberCount,
    settlement: charge.settlement,
    settledBy: charge.settledBy ? personRef(charge.settledBy, names) : null,
    manualNote: charge.manualNote,
    cancelReason: charge.cancelReason,
    lastRejection: rejection
      ? {
          reason: rejection.reason ?? '',
          invalidReceipt: rejection.metadata['invalidReceipt'] === true,
          at: rejection.occurredAt.toISOString(),
        }
      : null,
    currentReceipt: receipts.find((r) => r.status === 'vigente') ?? null,
    receipts,
    timeline: input.events.map((e) => eventView(e, names)),
    paymentInfo:
      isPayer && open ? { text: group.paymentInfoText, qrUrl: input.qrUrl, configured } : null,
    allowedActions: allowedActions(
      access,
      charge.status,
      groupStateOf({ status: group.status, frozen: group.frozen }),
    ),
    version: charge.version,
  };
}
