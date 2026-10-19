export const INVITE_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const INVITE_CODE_LENGTH = 8;

// 31 símbolos: 248 = 31 × 8; se descartan los bytes ≥ 248 para no sesgar el módulo.
const MAX_UNBIASED_BYTE = 248;

/**
 * Código de invitación de 8 caracteres sin ambiguos (RF-001-06). `randomBytes(n)` devuelve n bytes
 * aleatorios; se pide más si hacen falta por los descartados.
 */
export function generateInviteCode(
  randomBytes: (size: number) => Uint8Array,
  length = INVITE_CODE_LENGTH,
): string {
  let code = '';
  while (code.length < length) {
    for (const byte of randomBytes(length * 2)) {
      if (byte >= MAX_UNBIASED_BYTE) continue;
      code += INVITE_CODE_ALPHABET[byte % INVITE_CODE_ALPHABET.length];
      if (code.length === length) break;
    }
  }
  return code;
}
