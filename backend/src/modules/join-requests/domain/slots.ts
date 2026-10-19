export interface SlotsInput {
  totalSlots: number;
  /** Miembros activos, titular incluido. */
  activeMembers: number;
  /** Solicitudes en `esperando_pago` o `pago_informado` con plazo vigente. */
  reserved: number;
}

/** Cupos disponibles (RN-010-02); una solicitud `abierta` no reserva cupo. Nunca negativo. */
export function availableSlots({ totalSlots, activeMembers, reserved }: SlotsInput): number {
  return Math.max(0, totalSlots - activeMembers - reserved);
}
