export const DISPUTE_WINDOW_DAYS = 7;

export type DisputeKind = 'pago_sin_ingreso' | 'comprobante_falso';
export type DisputeRole = 'solicitante' | 'titular';
export type DisputeDenial =
  'not_final' | 'no_payment_reported' | 'not_eligible' | 'window_expired' | 'already_open';

export interface DisputeRequestInput {
  status:
    | 'abierta'
    | 'esperando_pago'
    | 'pago_informado'
    | 'aceptada'
    | 'rechazada'
    | 'cancelada'
    | 'expirada';
  /** El solicitante llegó a `pago_informado` (hay comprobante informado). */
  paymentReported: boolean;
  finalReason: string | null;
  finalAt: Date | null;
  rejectedAsFalse: boolean;
  /** Esta misma parte ya abrió un reclamo sobre la solicitud. */
  ownDisputeOpen?: boolean;
}

export type DisputeEligibility =
  { ok: true; kind: DisputeKind; closesAt: Date } | { ok: false; reason: DisputeDenial };

/**
 * ¿Puede esta parte abrir un reclamo? (RF-010-21, CA-010-27, CA-010-28). Solicitante: pago informado
 * y estado `rechazada` o `expirada` por `titular_sin_respuesta`. Titular: rechazó marcando el
 * comprobante como falso. Plazo de 7 días desde `final_at`; una sola vez por parte.
 */
export function disputeEligibility(args: {
  role: DisputeRole;
  request: DisputeRequestInput;
  now: Date;
}): DisputeEligibility {
  const { role, request, now } = args;
  if (request.finalAt === null) return { ok: false, reason: 'not_final' };
  if (!request.paymentReported) return { ok: false, reason: 'no_payment_reported' };

  let kind: DisputeKind;
  if (role === 'solicitante') {
    const eligible =
      request.status === 'rechazada' ||
      (request.status === 'expirada' && request.finalReason === 'titular_sin_respuesta');
    if (!eligible) return { ok: false, reason: 'not_eligible' };
    kind = 'pago_sin_ingreso';
  } else {
    if (request.status !== 'rechazada' || !request.rejectedAsFalse)
      return { ok: false, reason: 'not_eligible' };
    kind = 'comprobante_falso';
  }

  const closesAt = new Date(request.finalAt.getTime() + DISPUTE_WINDOW_DAYS * 24 * 3600_000);
  if (now.getTime() > closesAt.getTime()) return { ok: false, reason: 'window_expired' };
  if (request.ownDisputeOpen) return { ok: false, reason: 'already_open' };
  return { ok: true, kind, closesAt };
}

export const MIN_DISPUTE_TEXT = 10;
export const MAX_DISPUTE_TEXT = 500;
export const MIN_RESOLUTION_REASON = 10;
export const MAX_RESOLUTION_REASON = 300;

/** Texto de 10 a 500 caracteres sin contar los espacios de los extremos (RF-010-21, RF-010-22). */
export const isValidDisputeText = (text: unknown): text is string =>
  typeof text === 'string' &&
  text.trim().length >= MIN_DISPUTE_TEXT &&
  text.trim().length <= MAX_DISPUTE_TEXT;

/** Motivo de la resolución: 10 a 300 caracteres (RF-010-24). */
export const isValidResolutionReason = (reason: unknown): reason is string =>
  typeof reason === 'string' &&
  reason.trim().length >= MIN_RESOLUTION_REASON &&
  reason.trim().length <= MAX_RESOLUTION_REASON;
