export interface OfferedNowInput {
  slotsOffered: number;
  totalSlots: number;
  /** Miembros activos, titular incluido. */
  members: number;
  /** Cupos reservados por solicitudes vigentes (RN-010-02). */
  reserved: number;
}

/** Cupos que se muestran ahora: `max(0, min(ofrecidos, total − miembros − reservados))` (RN-008-04). */
export function offeredNow({
  slotsOffered,
  totalSlots,
  members,
  reserved,
}: OfferedNowInput): number {
  return Math.max(0, Math.min(slotsOffered, totalSlots - members - reserved));
}

/** Cupos a guardar tras un ingreso o salida; `0` implica cerrar la publicación (RN-008-04). */
export function clampOffered(input: Omit<OfferedNowInput, 'reserved'>): number {
  return offeredNow({ ...input, reserved: 0 });
}
