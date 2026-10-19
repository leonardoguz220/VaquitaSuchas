/** Celular boliviano normalizado como lo entrega la API (`"+59171234567"`). */
const BOLIVIAN_PHONE = /^\+591(\d{8})$/;

/**
 * Formato de lectura de un celular: `"+59171234567"` → `"+591 71234567"` (mockup
 * `Perfil.dc.html`). Solo agrega un espacio para leerlo mejor; no valida ni normaliza (eso lo
 * hace el backend). Cualquier otro valor se devuelve tal cual.
 */
export function formatPhone(phone: string): string {
  const match = BOLIVIAN_PHONE.exec(phone);
  return match ? `+591 ${match[1]}` : phone;
}
