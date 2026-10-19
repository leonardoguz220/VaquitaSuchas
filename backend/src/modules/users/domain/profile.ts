/** Nombre completo editable: de 2 a 80 caracteres sin contar espacios de los extremos. */
export function normalizeFullName(raw: string): string | null {
  const name = raw.trim();
  return name.length >= 2 && name.length <= 80 ? name : null;
}
