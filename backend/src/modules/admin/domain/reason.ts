/** Longitud del motivo de una acción de administración, tras recortar (RN-009-04, RN-009-07). */
export const REASON_MIN = 10;
export const REASON_MAX = 300;

export type ReasonResult = { ok: true; value: string } | { ok: false };

/** Valida el motivo: texto de 10 a 300 caracteres tras recortar espacios. */
export function validateReason(text: unknown): ReasonResult {
  if (typeof text !== 'string') return { ok: false };
  const value = text.trim();
  const length = [...value].length;
  if (length < REASON_MIN || length > REASON_MAX) return { ok: false };
  return { ok: true, value };
}
