// CI enmascarada: *****123 (solo los últimos 3 dígitos).
export function maskCi(ci: string): string {
  return `*****${ci.slice(-3)}`;
}
