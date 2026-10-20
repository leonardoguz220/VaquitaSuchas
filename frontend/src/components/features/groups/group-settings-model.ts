/**
 * Formulario de Ajustes del titular (T034, RF-001-14). Solo arma el cuerpo del `PATCH` con los
 * campos que cambiaron; no calcula cuotas ni montos: eso lo decide el backend.
 */
import { parseExchangeRate } from '@/lib/exchange-rate';
import { formatAmountInput, parseBsToCents } from '@/lib/money';
import type { GroupCurrency, GroupDetail, UpdateGroupRequest } from '@/services/groups';
import { BILLING_DAYS, FORM_MESSAGES, MAX_SLOTS, MIN_SLOTS } from './new-group-form-model';

export interface SettingsValues {
  name: string;
  price: string;
  currency: GroupCurrency;
  exchangeRate: string;
  billingDay: string;
  totalSlots: string;
}

export type SettingsField = keyof SettingsValues;
export type SettingsErrors = Partial<Record<SettingsField, string>>;

/** Valores del formulario tal como los dejó el grupo; el tipo de cambio se muestra con coma. */
export function settingsValuesOf(group: GroupDetail): SettingsValues {
  return {
    name: group.name,
    price: formatAmountInput(group.priceCents),
    currency: group.currency,
    exchangeRate: group.exchangeRate ? group.exchangeRate.replace('.', ',') : '',
    billingDay: String(group.billingDay),
    totalSlots: String(group.totalSlots),
  };
}

export type SettingsPatch =
  { ok: true; input: UpdateGroupRequest } | { ok: false; errors: SettingsErrors };

function parseSlots(text: string): number | null {
  if (!/^\d{1,2}$/.test(text.trim())) return null;
  const slots = Number(text);
  return slots >= MIN_SLOTS && slots <= MAX_SLOTS ? slots : null;
}

/**
 * Valida la forma de los campos y arma el `PATCH` solo con lo que cambió. Con `BS` se manda
 * `exchangeRate: null` si el grupo tenía tipo de cambio (RF-001-03).
 */
export function buildSettingsPatch(values: SettingsValues, group: GroupDetail): SettingsPatch {
  const errors: SettingsErrors = {};
  const name = values.name.trim();
  const priceCents = parseBsToCents(values.price);
  const totalSlots = parseSlots(values.totalSlots);
  const billingDay = Number(values.billingDay);
  const exchangeRate = values.currency === 'USD' ? parseExchangeRate(values.exchangeRate) : null;

  if (!name) errors.name = FORM_MESSAGES.nameRequired;
  if (priceCents === null || priceCents <= 0) errors.price = FORM_MESSAGES.priceInvalid;
  if (values.currency === 'USD' && exchangeRate === null) {
    errors.exchangeRate = FORM_MESSAGES.exchangeRateRequired;
  }
  if (totalSlots === null) errors.totalSlots = FORM_MESSAGES.slotsRange(MAX_SLOTS);
  if (!BILLING_DAYS.includes(billingDay)) errors.billingDay = FORM_MESSAGES.billingDayRange;
  if (Object.keys(errors).length > 0 || priceCents === null || totalSlots === null) {
    return { ok: false, errors };
  }

  const input: UpdateGroupRequest = {};
  if (name !== group.name) input.name = name;
  if (priceCents !== group.priceCents) input.priceCents = priceCents;
  if (values.currency !== group.currency) input.currency = values.currency;
  if (exchangeRate !== null && exchangeRate !== group.exchangeRate)
    input.exchangeRate = exchangeRate;
  if (exchangeRate === null && group.exchangeRate !== null) input.exchangeRate = null;
  if (billingDay !== group.billingDay) input.billingDay = billingDay;
  if (totalSlots !== group.totalSlots) input.totalSlots = totalSlots;
  return { ok: true, input };
}
