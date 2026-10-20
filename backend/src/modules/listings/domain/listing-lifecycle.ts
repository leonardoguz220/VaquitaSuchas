export type ListingStatus = 'activa' | 'oculta' | 'expirada' | 'retirada' | 'cerrada';
export type ListingAction =
  'publish' | 'hide' | 'restore' | 'expire' | 'renew' | 'withdraw' | 'close';

export const LISTING_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export type CannotPublishReason =
  'INVALID_SLOTS' | 'GROUP_CLOSED' | 'GROUP_FROZEN' | 'GROUP_NOT_ACCEPTING' | 'NO_FREE_SLOTS';

export interface CanPublishInput {
  group: { status: 'activo' | 'cerrado'; frozen: boolean; acceptingMembers: boolean };
  /** Cupos libres del grupo (total − miembros activos). */
  freeSlots: number;
  requested: number;
}

/** Reglas para publicar (RF-008-01, CA-008-02); `null` = puede publicar. */
export function canPublish({
  group,
  freeSlots,
  requested,
}: CanPublishInput): CannotPublishReason | null {
  if (group.status !== 'activo') return 'GROUP_CLOSED';
  if (group.frozen) return 'GROUP_FROZEN';
  if (!group.acceptingMembers) return 'GROUP_NOT_ACCEPTING';
  if (freeSlots < 1) return 'NO_FREE_SLOTS';
  if (!Number.isInteger(requested) || requested < 1) return 'INVALID_SLOTS';
  if (requested > freeSlots) return 'NO_FREE_SLOTS';
  return null;
}

/** Vencimiento: 30 días después de `from` (publicar o renovar; RF-008-05). */
export function expiresAt(from: Date): Date {
  return new Date(from.getTime() + LISTING_DAYS * DAY_MS);
}

/** Vencida cuando `expires_at <= ahora` (CA-008-14). */
export function isExpired(expiresAtValue: Date, now: Date): boolean {
  return expiresAtValue.getTime() <= now.getTime();
}

const TRANSITIONS: Record<ListingStatus, Partial<Record<ListingAction, ListingStatus>>> = {
  activa: {
    hide: 'oculta',
    expire: 'expirada',
    renew: 'activa',
    withdraw: 'retirada',
    close: 'cerrada',
  },
  oculta: { restore: 'activa', withdraw: 'retirada', close: 'cerrada' },
  expirada: { renew: 'activa', withdraw: 'retirada' },
  retirada: {},
  cerrada: {},
};

/**
 * Estado siguiente según las transiciones de `listings_transition_guard` (0082); `null` si la
 * acción no es válida desde ese estado. `current = null` solo admite `publish`.
 */
export function nextStatus(
  current: ListingStatus | null,
  action: ListingAction,
): ListingStatus | null {
  if (current === null) return action === 'publish' ? 'activa' : null;
  return TRANSITIONS[current][action] ?? null;
}
