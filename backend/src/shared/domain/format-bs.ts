const CENTS_PER_BS = 100;

/**
 * Da formato a un monto en centavos como `Bs 25,50` (coma decimal, punto de miles).
 * Solo para mensajes de correo y Telegram; el frontend tiene su propia utilidad.
 * No usa Intl: su salida depende de los datos ICU de cada Node. Rechaza lo que no sea un
 * entero seguro y los negativos, porque ningún mensaje del sistema muestra un monto negativo.
 */
export function formatBsCents(cents: number): string {
  if (!Number.isSafeInteger(cents)) {
    throw new Error('El monto debe ser un entero de centavos.');
  }
  if (cents < 0) {
    throw new Error('El monto no puede ser negativo.');
  }

  const bolivianos = Math.floor(cents / CENTS_PER_BS);
  const centavos = cents % CENTS_PER_BS;
  const thousands = String(bolivianos).replace(/\B(?=(\d{3})+$)/g, '.');
  return `Bs ${thousands},${String(centavos).padStart(2, '0')}`;
}
