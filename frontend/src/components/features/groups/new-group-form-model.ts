/**
 * Estado y validación de ayuda del paso 3 de `/grupos/nuevo` (RF-001-02, 03, 05, 20). Solo
 * revisa forma y límites que se ven en pantalla; las reglas y los montos los decide el backend.
 */
import { parseExchangeRate } from '@/lib/exchange-rate';
import { formatAmountInput, parseBsToCents } from '@/lib/money';
import type { CatalogPlan, CatalogService } from '@/services/catalog';
import type { CreateGroupRequest, GroupCurrency, QuoteRequest } from '@/services/groups';

/** Resultado de los pasos 1 y 2: un plan del catálogo o un servicio personalizado (RF-004-09). */
export type NewGroupChoice = { service: CatalogService; plan: CatalogPlan } | { custom: true };

export const MIN_SLOTS = 2;
/** Límite de RN-001-09 para un servicio personalizado; con plan manda `maxSlots` (RN-001-13). */
export const MAX_SLOTS = 20;
export const PAYMENT_TEXT_MAX = 500;
export const QR_MAX_BYTES = 2 * 1024 * 1024;
export const QR_TYPES = ['image/jpeg', 'image/png'] as const;
export const BILLING_DAYS = Array.from({ length: 31 }, (_, index) => index + 1);

export interface GroupFormValues {
  customServiceName: string;
  name: string;
  price: string;
  currency: GroupCurrency;
  exchangeRate: string;
  billingDay: string;
  totalSlots: string;
  paymentInfoText: string;
}

export type GroupFormField = keyof GroupFormValues | 'qr';
export type GroupFormErrors = Partial<Record<GroupFormField, string>>;

export const FORM_MESSAGES = {
  customServiceNameRequired: 'Escribe el nombre del servicio.',
  nameRequired: 'Escribe un nombre para el grupo.',
  priceInvalid: 'Escribe el precio con coma decimal, por ejemplo 14,66.',
  exchangeRateRequired: 'Con un precio en USD el tipo de cambio es obligatorio, por ejemplo 6,96.',
  slotsRange: (max: number) => `Los cupos van de ${MIN_SLOTS} a ${max}, contándote.`,
  paymentTextTooLong: `Los datos de pago pueden tener hasta ${PAYMENT_TEXT_MAX} caracteres.`,
  qrType: 'El QR debe ser una imagen JPG o PNG.',
  qrSize: 'El QR pesa más de 2 MB. Elige una imagen más liviana.',
} as const;

export function isCustom(choice: NewGroupChoice): choice is { custom: true } {
  return 'custom' in choice;
}

export function maxSlotsFor(choice: NewGroupChoice): number {
  return isCustom(choice) ? MAX_SLOTS : choice.plan.maxSlots;
}

/** Propone el precio, la moneda y los cupos del plan (RF-001-05); todo queda editable. */
export function initialValues(choice: NewGroupChoice): GroupFormValues {
  const plan = isCustom(choice) ? null : choice.plan;
  return {
    customServiceName: '',
    name: '',
    price: plan ? formatAmountInput(plan.priceCents) : '',
    currency: plan?.currency ?? 'BS',
    exchangeRate: '',
    billingDay: '1',
    totalSlots: String(plan?.maxSlots ?? MIN_SLOTS),
    paymentInfoText: '',
  };
}

function parsePrice(text: string): number | null {
  const cents = parseBsToCents(text);
  return cents !== null && cents > 0 ? cents : null;
}

function parseSlots(text: string, max: number): number | null {
  if (!/^\d{1,2}$/.test(text.trim())) return null;
  const slots = Number(text);
  return slots >= MIN_SLOTS && slots <= max ? slots : null;
}

/** Datos para `POST /groups/quote`, o `null` si todavía falta algo para cotizar. */
export function toQuoteRequest(
  values: GroupFormValues,
  choice: NewGroupChoice,
): QuoteRequest | null {
  const priceCents = parsePrice(values.price);
  const memberCount = parseSlots(values.totalSlots, maxSlotsFor(choice));
  if (priceCents === null || memberCount === null) return null;
  if (values.currency === 'BS') return { priceCents, currency: 'BS', memberCount };
  const exchangeRate = parseExchangeRate(values.exchangeRate);
  if (exchangeRate === null) return null;
  return { priceCents, currency: 'USD', exchangeRate, memberCount };
}

export type ValidationResult =
  { ok: true; request: CreateGroupRequest } | { ok: false; errors: GroupFormErrors };

/** Arma el cuerpo de `POST /groups`; con BS no se envía el tipo de cambio (RF-001-03). */
export function validateGroupForm(
  values: GroupFormValues,
  choice: NewGroupChoice,
): ValidationResult {
  const errors: GroupFormErrors = {};
  const customName = values.customServiceName.trim();
  const name = values.name.trim();
  const priceCents = parsePrice(values.price);
  const max = maxSlotsFor(choice);
  const totalSlots = parseSlots(values.totalSlots, max);
  const exchangeRate = values.currency === 'USD' ? parseExchangeRate(values.exchangeRate) : null;
  const paymentText = values.paymentInfoText.trim();

  if (isCustom(choice) && !customName)
    errors.customServiceName = FORM_MESSAGES.customServiceNameRequired;
  if (!name) errors.name = FORM_MESSAGES.nameRequired;
  if (priceCents === null) errors.price = FORM_MESSAGES.priceInvalid;
  if (values.currency === 'USD' && exchangeRate === null) {
    errors.exchangeRate = FORM_MESSAGES.exchangeRateRequired;
  }
  if (totalSlots === null) errors.totalSlots = FORM_MESSAGES.slotsRange(max);
  if (values.paymentInfoText.length > PAYMENT_TEXT_MAX) {
    errors.paymentInfoText = FORM_MESSAGES.paymentTextTooLong;
  }
  if (Object.keys(errors).length > 0 || priceCents === null || totalSlots === null) {
    return { ok: false, errors };
  }

  const request: CreateGroupRequest = {
    catalogPlanSlug: isCustom(choice) ? null : choice.plan.slug,
    customServiceName: isCustom(choice) ? customName : null,
    name,
    priceCents,
    currency: values.currency,
    billingDay: Number(values.billingDay),
    totalSlots,
    paymentInfoText: paymentText || null,
  };
  if (exchangeRate !== null) request.exchangeRate = exchangeRate;
  return { ok: true, request };
}

/** Ayuda en el cliente: el backend vuelve a validar el tipo real y el tamaño (413 y 415). */
export function validateQrFile(file: File): string | null {
  if (!(QR_TYPES as readonly string[]).includes(file.type)) return FORM_MESSAGES.qrType;
  if (file.size > QR_MAX_BYTES) return FORM_MESSAGES.qrSize;
  return null;
}
