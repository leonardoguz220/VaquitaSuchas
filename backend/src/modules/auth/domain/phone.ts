// Celular boliviano a formato E.164 (+591XXXXXXXX); null si no es válido (RF-003-05).
export function normalizeBolivianPhone(raw: string): string | null {
  const compact = raw.replace(/[\s-]/g, '');
  if (!/^\+?\d+$/.test(compact)) return null;
  const digits = compact.replace(/^\+/, '');
  const local = digits.startsWith('591') ? digits.slice(3) : digits;
  return /^[67]\d{7}$/.test(local) ? `+591${local}` : null;
}
