// CI normalizada (RF-003-22): sin espacios, solo dígitos, 5 a 10; null si no es válida.
export function normalizeCi(raw: string): string | null {
  const ci = raw.replace(/\s+/g, '');
  return /^\d{5,10}$/.test(ci) ? ci : null;
}
