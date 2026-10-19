// Formato de montos para la interfaz (RF-000-17, CA-000-11).
// Solo da formato y lee lo que escribe la persona: no calcula cuotas ni montos (CLAUDE.md §2, regla 8).
// No usa Intl.NumberFormat porque su salida depende de los datos ICU de cada navegador.

const CENTS_PER_UNIT = 100;

function formatCents(prefix: string, cents: number): string {
  if (!Number.isSafeInteger(cents)) {
    throw new RangeError('El monto debe ser un entero de centavos.');
  }
  if (cents < 0) {
    throw new RangeError('El monto no puede ser negativo.');
  }

  const units = Math.floor(cents / CENTS_PER_UNIT);
  const remainder = cents % CENTS_PER_UNIT;
  const withThousands = String(units).replace(/\B(?=(\d{3})+$)/g, '.');
  return `${prefix} ${withThousands},${String(remainder).padStart(2, '0')}`;
}

/**
 * Da formato a un monto en centavos de boliviano: `formatBs(250050)` → `Bs 2.500,50`.
 * Coma decimal, punto de miles y espacio normal después de `Bs`.
 * Lanza `RangeError` si el monto no es un entero seguro o es negativo: la API siempre
 * entrega centavos enteros y ningún monto del sistema se muestra en negativo.
 */
export function formatBs(cents: number): string {
  return formatCents('Bs', cents);
}

/**
 * Da formato a un precio en centavos de dólar con la misma convención: `formatUsd(1799)` → `USD 17,99`.
 * Pensado para mostrar el precio de referencia de un servicio que entrega la API (spec 004).
 */
export function formatUsd(cents: number): string {
  return formatCents('USD', cents);
}

/** Moneda de un precio que entrega la API (catálogo y suscripciones). */
export type PriceCurrency = 'USD' | 'BS';

/**
 * Da formato a un precio en su propia moneda, sin convertirla: `formatPrice(1466, 'USD')` →
 * `USD 14,66` y `formatPrice(2550, 'BS')` → `Bs 25,50`. La conversión la hace el backend.
 */
export function formatPrice(cents: number, currency: PriceCurrency): string {
  return currency === 'USD' ? formatUsd(cents) : formatBs(cents);
}

/**
 * Monto en centavos como texto para un campo editable, sin prefijo: `formatAmountInput(146600)`
 * → `1.466,00`. `parseBsToCents` lo vuelve a leer igual. Sirve para proponer un precio (RF-001-05).
 */
export function formatAmountInput(cents: number): string {
  return formatCents('', cents).trimStart();
}

// Parte entera: sin separadores, o con punto de miles en grupos exactos de tres.
// Parte decimal opcional: coma seguida de uno o dos dígitos.
const BS_INPUT = /^(?:bs\s*)?(\d+|\d{1,3}(?:\.\d{3})+)(?:,(\d{1,2}))?$/i;

/**
 * Lee un monto escrito en formato boliviano y lo devuelve en centavos enteros.
 * Acepta `25`, `25,5`, `25,50`, `1.234,56`, `1234,56` y el prefijo opcional `Bs`.
 * Devuelve `null` si el texto no es un monto válido: vacío, negativo, con más de dos
 * decimales, con punto decimal (`25.50`), con miles mal agrupados o fuera del rango seguro.
 * La validación definitiva del monto la hace siempre el backend.
 */
export function parseBsToCents(text: string): number | null {
  const normalized = text.replace(/\s+/g, ' ').trim();
  const match = BS_INPUT.exec(normalized);
  if (!match) {
    return null;
  }

  const integerPart = match[1].replace(/\./g, '');
  const decimalPart = (match[2] ?? '').padEnd(2, '0');
  const cents = Number(integerPart) * CENTS_PER_UNIT + Number(decimalPart);
  return Number.isSafeInteger(cents) ? cents : null;
}

/** Alias con el nombre del plan §6 (`lib/money.ts`: `formatBs`, `parse`). */
export const parse = parseBsToCents;
