// Formulario del paso 3 de "Crear suscripción" (plan 001 §6). Lee lo que escribe la persona y
// arma los cuerpos de `POST /groups/quote` y `POST /groups` del contrato 001. La validación es
// solo de ayuda: el backend valida siempre (rangos del total en Bs, cupos del plan, habilitación).
// No calcula cuotas ni convierte monedas.
import { parseExchangeRateInput } from './exchange-rate';
import { parseBsToCents } from './money';

export type GroupFormCurrency = 'USD' | 'BS';

/** Valores tal como están en los campos (texto). */
export interface GroupFormValues {
  customServiceName: string;
  name: string;
  currency: GroupFormCurrency;
  price: string;
  exchangeRate: string;
  billingDay: string;
  totalSlots: string;
  paymentInfoText: string;
}

/** Lo que viene del paso 1 y 2: plan del catálogo o servicio personalizado. */
export interface GroupFormContext {
  /** `null` para un servicio personalizado. */
  planSlug: string | null;
  /** Cupos máximos del plan (titular incluido); `null` para un servicio personalizado. */
  planMaxSlots: number | null;
}

export type GroupFormField = Exclude<keyof GroupFormValues, 'currency'>;
export type GroupFormErrors = Partial<Record<GroupFormField, string>>;

/** Límites de los campos (RF-001-02, RF-001-20 y `data-model.md` de la spec 001). */
export const GROUP_LIMITS = {
  nameMin: 2,
  nameMax: 60,
  minSlots: 2,
  maxSlots: 20,
  minBillingDay: 1,
  maxBillingDay: 31,
  paymentInfoMax: 500,
} as const;

/** Cupos máximos que se pueden elegir: los del plan o 20 en un servicio personalizado. */
export function maxSlotsFor(context: GroupFormContext): number {
  return context.planMaxSlots ?? GROUP_LIMITS.maxSlots;
}

export const GROUP_FORM_MESSAGES = {
  customServiceName: `Escribe el nombre del servicio (de ${GROUP_LIMITS.nameMin} a ${GROUP_LIMITS.nameMax} caracteres).`,
  name: `Escribe un nombre de ${GROUP_LIMITS.nameMin} a ${GROUP_LIMITS.nameMax} caracteres.`,
  price: 'Escribe el precio con coma decimal, por ejemplo 14,66.',
  exchangeRate: 'Escribe el tipo de cambio, por ejemplo 6,96.',
  billingDay: 'Elige el día de cobro.',
  totalSlots: (max: number) => `Elige entre ${GROUP_LIMITS.minSlots} y ${max} cupos, contándote.`,
  paymentInfoText: `Los datos de pago pueden tener hasta ${GROUP_LIMITS.paymentInfoMax} caracteres.`,
} as const;

function isLengthBetween(text: string, min: number, max: number): boolean {
  const length = Array.from(text.trim()).length;
  return length >= min && length <= max;
}

/** Entero escrito con solo dígitos, o `null`. */
function parseWholeNumber(text: string): number | null {
  const trimmed = text.trim();
  return /^\d{1,3}$/.test(trimmed) ? Number(trimmed) : null;
}

function parsePrice(text: string): number | null {
  const cents = parseBsToCents(text);
  return cents !== null && cents > 0 ? cents : null;
}

function parseSlots(text: string, context: GroupFormContext): number | null {
  const slots = parseWholeNumber(text);
  if (slots === null || slots < GROUP_LIMITS.minSlots || slots > maxSlotsFor(context)) return null;
  return slots;
}

/**
 * Cuerpo de `POST /groups/quote` si el precio, la moneda, el tipo de cambio (con USD) y los
 * cupos son válidos; si no, `null` y no se pide la cotización. `memberCount` son los cupos del
 * grupo: "Cada miembro pagaría" con el grupo completo.
 */
export function toQuoteRequest(
  values: GroupFormValues,
  context: GroupFormContext,
): {
  priceCents: number;
  currency: GroupFormCurrency;
  exchangeRate?: string;
  memberCount: number;
} | null {
  const priceCents = parsePrice(values.price);
  const memberCount = parseSlots(values.totalSlots, context);
  if (priceCents === null || memberCount === null) return null;
  if (values.currency === 'BS') return { priceCents, currency: 'BS', memberCount };
  const exchangeRate = parseExchangeRateInput(values.exchangeRate);
  if (exchangeRate === null) return null;
  return { priceCents, currency: 'USD', exchangeRate, memberCount };
}

export interface CreateGroupBody {
  catalogPlanSlug: string | null;
  customServiceName: string | null;
  name: string;
  priceCents: number;
  currency: GroupFormCurrency;
  exchangeRate: string | null;
  billingDay: number;
  totalSlots: number;
  paymentInfoText: string | null;
}

export type GroupFormResult =
  { ok: true; body: CreateGroupBody } | { ok: false; errors: GroupFormErrors };

/**
 * Valida los campos (solo como ayuda) y arma el cuerpo de `POST /groups`: exactamente uno de
 * `catalogPlanSlug` o `customServiceName`, y `exchangeRate` solo con USD (RF-001-03).
 */
export function validateGroupForm(
  values: GroupFormValues,
  context: GroupFormContext,
): GroupFormResult {
  const errors: GroupFormErrors = {};
  const isCustom = context.planSlug === null;

  if (
    isCustom &&
    !isLengthBetween(values.customServiceName, GROUP_LIMITS.nameMin, GROUP_LIMITS.nameMax)
  ) {
    errors.customServiceName = GROUP_FORM_MESSAGES.customServiceName;
  }
  if (!isLengthBetween(values.name, GROUP_LIMITS.nameMin, GROUP_LIMITS.nameMax)) {
    errors.name = GROUP_FORM_MESSAGES.name;
  }
  const priceCents = parsePrice(values.price);
  if (priceCents === null) errors.price = GROUP_FORM_MESSAGES.price;

  const exchangeRate =
    values.currency === 'USD' ? parseExchangeRateInput(values.exchangeRate) : null;
  if (values.currency === 'USD' && exchangeRate === null) {
    errors.exchangeRate = GROUP_FORM_MESSAGES.exchangeRate;
  }
  const billingDay = parseWholeNumber(values.billingDay);
  if (
    billingDay === null ||
    billingDay < GROUP_LIMITS.minBillingDay ||
    billingDay > GROUP_LIMITS.maxBillingDay
  ) {
    errors.billingDay = GROUP_FORM_MESSAGES.billingDay;
  }
  const totalSlots = parseSlots(values.totalSlots, context);
  if (totalSlots === null) errors.totalSlots = GROUP_FORM_MESSAGES.totalSlots(maxSlotsFor(context));

  const paymentInfoText = values.paymentInfoText.trim();
  if (Array.from(paymentInfoText).length > GROUP_LIMITS.paymentInfoMax) {
    errors.paymentInfoText = GROUP_FORM_MESSAGES.paymentInfoText;
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    body: {
      catalogPlanSlug: context.planSlug,
      customServiceName: isCustom ? values.customServiceName.trim() : null,
      name: values.name.trim(),
      priceCents: priceCents as number,
      currency: values.currency,
      exchangeRate,
      billingDay: billingDay as number,
      totalSlots: totalSlots as number,
      paymentInfoText: paymentInfoText === '' ? null : paymentInfoText,
    },
  };
}

/** Tipos del QR que se aceptan en el cliente (RF-001-20). El servidor valida el tipo real. */
export const QR_ACCEPTED_TYPES = ['image/jpeg', 'image/png'] as const;
/** 2 MB (RF-001-20). */
export const QR_MAX_BYTES = 2 * 1024 * 1024;

export type QrFileProblem = 'type' | 'size';

/** Ayuda previa a la subida del QR: tipo JPG/PNG y tamaño de hasta 2 MB. */
export function checkQrFile(file: Pick<File, 'type' | 'size'>): QrFileProblem | null {
  if (!(QR_ACCEPTED_TYPES as readonly string[]).includes(file.type)) return 'type';
  if (file.size > QR_MAX_BYTES) return 'size';
  return null;
}
