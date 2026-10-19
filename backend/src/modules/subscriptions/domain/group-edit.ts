import type { Currency } from './money.js';

/** Campos que el titular puede editar (RF-001-14). */
export interface GroupEditable {
  name: string;
  priceCents: number;
  currency: Currency;
  exchangeRate: string | null;
  billingDay: number;
  totalSlots: number;
  acceptingMembers: boolean;
}

export type GroupPatch = Partial<GroupEditable>;

/**
 * Resultado de aplicar el cambio parcial al estado actual. El tipo de cambio solo se conserva con
 * USD: al pasar a BS se descarta salvo que el cambio traiga uno (que `validateGroupInput` rechaza,
 * RF-001-03), y al pasar a USD sin tipo de cambio queda vacío para que se exija.
 */
export function applyGroupPatch(current: GroupEditable, patch: GroupPatch): GroupEditable {
  const currency = patch.currency ?? current.currency;
  let exchangeRate: string | null;
  if (patch.exchangeRate !== undefined) exchangeRate = patch.exchangeRate;
  else
    exchangeRate = currency === 'USD' && current.currency === 'USD' ? current.exchangeRate : null;
  return {
    name: patch.name ?? current.name,
    priceCents: patch.priceCents ?? current.priceCents,
    currency,
    exchangeRate,
    billingDay: patch.billingDay ?? current.billingDay,
    totalSlots: patch.totalSlots ?? current.totalSlots,
    acceptingMembers: patch.acceptingMembers ?? current.acceptingMembers,
  };
}
