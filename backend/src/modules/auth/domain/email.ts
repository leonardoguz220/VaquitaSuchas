// Correo normalizado: sin espacios y en minúsculas (RF-003-02).
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// Forma canónica para la huella de baneo (RF-003-19): en Gmail se ignoran puntos y alias "+".
export function canonicalEmailForBan(email: string): string {
  const normalized = normalizeEmail(email);
  const at = normalized.lastIndexOf('@');
  if (at < 0) return normalized;
  const local = normalized.slice(0, at);
  const domain = normalized.slice(at + 1);
  if (domain !== 'gmail.com' && domain !== 'googlemail.com') return normalized;
  const base = local.split('+')[0].replace(/\./g, '');
  return `${base}@gmail.com`;
}
