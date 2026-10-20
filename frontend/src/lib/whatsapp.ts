/**
 * Enlace `wa.me` con un mensaje prellenado (RF-005-15, RF-005-16). El servidor entrega el texto
 * y, para un recordatorio, el celular; el cliente solo arma la URL y no se envía nada desde el
 * servidor (CA-005-17).
 */
export function whatsAppUrl(text: string, phone?: string | null): string {
  const digits = phone ? phone.replace(/\D/g, '') : '';
  return `https://wa.me/${digits}?${new URLSearchParams({ text }).toString()}`;
}
