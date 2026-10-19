// Tipo de cambio (Bs por 1 USD) que escribe el titular y que entrega la API como texto
// decimal (`"6.9600"`, contrato 001). Solo lee y da formato: la conversión la hace el backend.

// Hasta 6 dígitos enteros y 4 decimales, como `numeric(10,4)` de la base; coma o punto decimal.
const RATE_INPUT = /^(\d{1,6})(?:[.,](\d{1,4}))?$/;

/**
 * Lee el tipo de cambio escrito por la persona (`6,96`, `6.96`, `6,9633`) y lo devuelve con
 * cuatro decimales y punto (`"6.9600"`), el formato del contrato. Devuelve `null` si está
 * vacío, es cero o tiene más de cuatro decimales. La validación definitiva es del backend.
 */
export function parseExchangeRateInput(text: string): string | null {
  const match = RATE_INPUT.exec(text.trim());
  if (!match) return null;
  const integer = String(Number(match[1]));
  const decimals = (match[2] ?? '').padEnd(4, '0');
  if (/^0+$/.test(match[1]) && /^0+$/.test(decimals)) return null;
  return `${integer}.${decimals}`;
}

/**
 * Muestra un tipo de cambio de la API con coma decimal y sin ceros de más, pero con al menos
 * dos decimales: `"6.9600"` → `6,96`, `"6.9633"` → `6,9633`, `"7"` → `7,00`.
 */
export function formatExchangeRate(rate: string): string {
  const [integer, decimals = ''] = rate.split('.');
  const trimmed = decimals.replace(/0+$/, '').padEnd(2, '0');
  return `${integer},${trimmed}`;
}
