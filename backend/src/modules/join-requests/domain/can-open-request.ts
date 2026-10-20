export const MAX_ACTIVE_REQUESTS_TOTAL = 5;

export type OpenRequestRule =
  | 'account_restricted'
  | 'group_not_active'
  | 'group_frozen'
  | 'group_not_accepting'
  | 'window_closed'
  | 'no_slots'
  | 'already_member'
  | 'open_charges'
  | 'active_request_in_group'
  | 'too_many_active_requests';

export interface CanOpenRequestInput {
  /** Cuenta suspendida o baneada (RF-003). */
  accountRestricted: boolean;
  group: { status: 'activo' | 'cerrado'; frozen: boolean; acceptingMembers: boolean };
  windowOpen: boolean;
  availableSlots: number;
  isMember: boolean;
  /** Cobros `pendiente`, `en_revision` o `atrasado` de la persona en ese grupo (RN-010-13). */
  openChargesInGroup: number;
  activeRequestsInGroup: number;
  activeRequestsTotal: number;
}

/** Reglas incumplidas al abrir una solicitud (RF-010-01, RF-010-02, RN-010-13); vacía = puede abrir. */
export function canOpenRequest(input: CanOpenRequestInput): OpenRequestRule[] {
  const broken: OpenRequestRule[] = [];
  if (input.accountRestricted) broken.push('account_restricted');
  if (input.group.status !== 'activo') broken.push('group_not_active');
  if (input.group.frozen) broken.push('group_frozen');
  if (!input.group.acceptingMembers) broken.push('group_not_accepting');
  if (!input.windowOpen) broken.push('window_closed');
  if (input.availableSlots < 1) broken.push('no_slots');
  if (input.isMember) broken.push('already_member');
  if (input.openChargesInGroup > 0) broken.push('open_charges');
  if (input.activeRequestsInGroup >= 1) broken.push('active_request_in_group');
  if (input.activeRequestsTotal >= MAX_ACTIVE_REQUESTS_TOTAL)
    broken.push('too_many_active_requests');
  return broken;
}
