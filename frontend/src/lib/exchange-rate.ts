// Tipo de cambio (Bs por 1 USD) que escribe el titular (RF-001-03). Solo lee y da formato:
// el contrato lo pide como texto con cuatro decimales («6.9600») y el backend lo valida.

const RATE_INPUT = /^(\d{1,4})(?:[.,](\d{1,4}))?$/;

/** `6,96` o `6.96` → `"6.9600"`. Devuelve `null` si está vacío, es cero o no es un número válido. */
export function parseExchangeRate(text: string): string | null {
  const match = RATE_INPUT.exec(text.trim());
  if (!match) return null;
  const integer = String(Number(match[1]));
  const decimals = (match[2] ?? '').padEnd(4, '0');
  if (/^0+$/.test(integer + decimals)) return null;
  return `${integer}.${decimals}`;
}

/** `"6.9600"` → `6,96`; conserva hasta cuatro decimales si no son ceros (`"6.9650"` → `6,965`). */
export function formatExchangeRate(rate: string): string {
  const [integer, decimals = ''] = rate.split('.');
  const trimmed = decimals.replace(/0+$/, '').padEnd(2, '0');
  return `${integer},${trimmed}`;
}
