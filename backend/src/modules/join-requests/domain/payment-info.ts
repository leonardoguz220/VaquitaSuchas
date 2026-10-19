import { detectFileType } from '../../billing/domain/file-signature.js';

export const MAX_PAYMENT_TEXT = 500;
export const MAX_QR_BYTES = 2 * 1024 * 1024;

export interface PaymentInfoInput {
  /** Texto que el titular escribió al enviar los datos de pago. */
  text: string | null;
  /** El titular adjuntó un QR en esa petición. */
  hasQr: boolean;
}

export interface GroupPaymentInfo {
  text: string | null;
  hasQr: boolean;
}

export interface ResolvedPaymentInfo {
  text: string | null;
  /** `upload`: el QR subido ahora; `group`: copia del QR del grupo; `null`: sin QR. */
  qr: 'upload' | 'group' | null;
}

/**
 * Datos de pago de la solicitud (RF-010-11): si el titular envía texto o QR se usa solo eso; si
 * no envía nada, los del grupo (RF-001-20). `null` si no hay ninguno (`PAYMENT_INFO_MISSING`).
 */
export function resolvePaymentInfo(
  input: PaymentInfoInput,
  group: GroupPaymentInfo,
): ResolvedPaymentInfo | null {
  const text = input.text?.trim() || null;
  if (text !== null || input.hasQr) return { text, qr: input.hasQr ? 'upload' : null };
  const groupText = group.text?.trim() || null;
  if (groupText === null && !group.hasQr) return null;
  return { text: groupText, qr: group.hasQr ? 'group' : null };
}

export type QrFileCheck =
  | { ok: true; type: 'jpeg' | 'png' }
  | { ok: false; reason: 'empty' | 'too_large' | 'unsupported_type' };

/** Tamaño (≤ 2 MB) y tipo real (JPG o PNG) del QR, por firma binaria. */
export function checkQrFile(bytes: Uint8Array): QrFileCheck {
  if (bytes.length === 0) return { ok: false, reason: 'empty' };
  if (bytes.length > MAX_QR_BYTES) return { ok: false, reason: 'too_large' };
  const type = detectFileType(bytes);
  return type === 'jpeg' || type === 'png'
    ? { ok: true, type }
    : { ok: false, reason: 'unsupported_type' };
}
