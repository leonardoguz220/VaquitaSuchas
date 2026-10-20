export type FactStatus = 'pendiente' | 'en_revision' | 'pagado' | 'atrasado' | 'cancelado';

/** Hechos de un cobro de una persona que la reputación necesita para puntuar (RF-007-12). */
export interface ChargeFact {
  chargeId: string;
  status: FactStatus;
  origin: 'ciclo' | 'ingreso';
  /** Instante exclusivo de vencimiento. */
  dueAt: Date;
  firstSubmittedAt: Date | null;
  lastUploadAt: Date | null;
  paidAt: Date | null;
  settlement: 'comprobante' | 'manual' | 'ingreso' | null;
  /** El titular rechazó algún comprobante marcándolo como «comprobante inválido». */
  invalidReceipt: boolean;
  /** El grupo está congelado porque su titular fue baneado. */
  groupFrozenByBan: boolean;
  /** Excluido de la reputación por el titular (RF-007-14). */
  excluded: boolean;
}
