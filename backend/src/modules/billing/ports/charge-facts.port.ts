import type { Queryable } from '../../../shared/db/db.service.js';
import type { ChargeStatus } from '../domain/charge-state.js';

/**
 * Hechos de un cobro que la reputación (spec 007, RF-007-12) necesita para puntuar. Todos son
 * datos ya guardados: el puerto no calcula calificaciones.
 */
export interface ChargeFact {
  chargeId: string;
  userId: string;
  groupId: string;
  status: ChargeStatus;
  origin: 'ciclo' | 'ingreso';
  dueAt: Date;
  paidAt: Date | null;
  settlement: 'comprobante' | 'manual' | 'ingreso' | null;
  /** Primera subida de comprobante (RN-002-08); `null` si nunca subió uno. */
  firstSubmittedAt: Date | null;
  /** Última subida de comprobante; `null` si nunca subió uno. */
  lastSubmittedAt: Date | null;
  /** Instante que cuenta para la puntualidad: la primera subida, o la última tras un rechazo «comprobante inválido». */
  punctualityAt: Date | null;
  /** El titular rechazó algún comprobante marcándolo como «comprobante inválido». */
  hadInvalidReceiptRejection: boolean;
  /** El grupo está congelado porque su titular fue baneado. */
  groupFrozenByBan: boolean;
}

/**
 * Puerto de lectura de hechos de cobros. Lo consume `reputation` (spec 007) y lo implementa
 * `billing`. Devuelve los cobros con vencimiento desde `since`, del más antiguo al más reciente.
 */
export interface ChargeFactsPort {
  listForUsers(q: Queryable, userIds: readonly string[], since: Date): Promise<ChargeFact[]>;
}

export const CHARGE_FACTS_PORT = Symbol('CHARGE_FACTS_PORT');
