import { computeTotalBsCents, parseExchangeRate, type Currency } from './money.js';

export const MIN_TOTAL_BS_CENTS = 100;
export const MAX_TOTAL_BS_CENTS = 500_000;
export const MIN_SLOTS = 2;
export const MAX_SLOTS = 20;
export const MAX_ACTIVE_OWNED_GROUPS = 5;

export interface GroupInput {
  priceCents: number;
  currency: Currency;
  exchangeRate?: string | number | null;
  totalSlots: number;
  billingDay: number;
}

export type GroupRule =
  | 'price_range'
  | 'slots_range'
  | 'billing_day_range'
  | 'slots_exceed_plan'
  | 'exchange_rate_required'
  | 'exchange_rate_not_allowed';

const isInt = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n);

/** Reglas incumplidas al crear o editar un grupo (RN-001-09, RN-001-13, RF-001-03); vacía = válido. */
export function validateGroupInput(input: GroupInput, plan?: { maxSlots: number }): GroupRule[] {
  const broken: GroupRule[] = [];
  const hasRate = input.exchangeRate !== undefined && input.exchangeRate !== null;

  if (input.currency === 'BS') {
    if (hasRate) broken.push('exchange_rate_not_allowed');
  } else if (!hasRate || parseExchangeRate(input.exchangeRate as string | number) === null) {
    broken.push('exchange_rate_required');
  }

  if (!isInt(input.priceCents) || input.priceCents <= 0) {
    broken.push('price_range');
  } else if (!broken.includes('exchange_rate_required')) {
    const total = computeTotalBsCents(
      input.currency,
      input.priceCents,
      input.currency === 'USD' ? input.exchangeRate : null,
    );
    if (total < MIN_TOTAL_BS_CENTS || total > MAX_TOTAL_BS_CENTS) broken.push('price_range');
  }

  if (!isInt(input.totalSlots) || input.totalSlots < MIN_SLOTS || input.totalSlots > MAX_SLOTS) {
    broken.push('slots_range');
  } else if (plan && input.totalSlots > plan.maxSlots) {
    broken.push('slots_exceed_plan');
  }

  if (!isInt(input.billingDay) || input.billingDay < 1 || input.billingDay > 31) {
    broken.push('billing_day_range');
  }
  return broken;
}

export type LeaveRule = 'owner_must_transfer_or_close' | 'open_charges';

/** ¿Puede abandonar el grupo? null = sí (RN-001-08, RF-001-16). */
export function canLeave(role: 'titular' | 'miembro', openCharges: number): LeaveRule | null {
  if (role === 'titular') return 'owner_must_transfer_or_close';
  return openCharges > 0 ? 'open_charges' : null;
}

export type OwnershipRule = 'not_active_member' | 'not_host_eligible' | 'too_many_active_groups';

/** Reglas que impiden recibir la titularidad (RF-001-17, RN-001-14); vacía = puede. */
export function canReceiveOwnership(input: {
  isActiveMember: boolean;
  isHostEligible: boolean;
  activeOwnedGroups: number;
}): OwnershipRule[] {
  const broken: OwnershipRule[] = [];
  if (!input.isActiveMember) broken.push('not_active_member');
  if (!input.isHostEligible) broken.push('not_host_eligible');
  if (input.activeOwnedGroups >= MAX_ACTIVE_OWNED_GROUPS) broken.push('too_many_active_groups');
  return broken;
}
