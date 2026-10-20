import type { RequestStatus } from './request-state.js';

export type FinalReason =
  'plazo_solicitud' | 'ventana_cerrada' | 'plazo_pago' | 'titular_sin_respuesta';

export interface EffectiveStateInput {
  status: RequestStatus;
  openDeadlineAt: Date;
  payDeadlineAt: Date | null;
  decisionDeadlineAt: Date | null;
  /** Fin exclusivo de la ventana de ingreso aplicable a la solicitud abierta (para distinguir el motivo). */
  windowEndsAt?: Date | null;
  finalReason?: string | null;
}

export interface EffectiveState {
  status: RequestStatus;
  /** Motivo calculado si el vencimiento aún no se persistió; si no, el guardado (o null). */
  reason: string | null;
}

const reached = (deadline: Date | null | undefined, now: Date): boolean =>
  deadline != null && now.getTime() >= deadline.getTime();

/**
 * Estado real de la solicitud aplicando los plazos vencidos sin escribir (research R1):
 * `abierta` vencida o fuera de ventana → `expirada`; `esperando_pago` sin comprobante a tiempo →
 * `expirada/plazo_pago`; `pago_informado` sin decisión → `expirada/titular_sin_respuesta`.
 */
export function effectiveState(request: EffectiveStateInput, now: Date): EffectiveState {
  const stored = request.finalReason ?? null;
  switch (request.status) {
    case 'abierta':
      if (reached(request.windowEndsAt, now))
        return { status: 'expirada', reason: 'ventana_cerrada' };
      if (reached(request.openDeadlineAt, now))
        return { status: 'expirada', reason: 'plazo_solicitud' };
      return { status: 'abierta', reason: null };
    case 'esperando_pago':
      return reached(request.payDeadlineAt, now)
        ? { status: 'expirada', reason: 'plazo_pago' }
        : { status: 'esperando_pago', reason: null };
    case 'pago_informado':
      return reached(request.decisionDeadlineAt, now)
        ? { status: 'expirada', reason: 'titular_sin_respuesta' }
        : { status: 'pago_informado', reason: null };
    default:
      return { status: request.status, reason: stored };
  }
}
