import { detectFileType } from '../../billing/domain/file-signature.js';

/** Texto de los datos de pago del grupo (RF-001-20). */
export const MAX_PAYMENT_INFO_TEXT = 500;
/** Tamaño máximo de la imagen del QR (RF-001-20). */
export const MAX_PAYMENT_QR_BYTES = 2 * 1024 * 1024;
/** Vigencia de la URL firmada del QR (RF-001-20). */
export const PAYMENT_QR_URL_TTL_SECONDS = 600;

export type PaymentQrType = 'jpeg' | 'png';
export type PaymentQrMime = 'image/jpeg' | 'image/png';

export type PaymentQrCheck =
  | { ok: true; type: PaymentQrType }
  | { ok: false; reason: 'empty' | 'too_large' | 'unsupported_type' };

/** Tamaño (≤ 2 MB) y tipo real (JPG o PNG) del QR, por firma binaria y no por nombre o MIME. */
export function checkPaymentQr(bytes: Uint8Array): PaymentQrCheck {
  if (bytes.length === 0) return { ok: false, reason: 'empty' };
  if (bytes.length > MAX_PAYMENT_QR_BYTES) return { ok: false, reason: 'too_large' };
  const type = detectFileType(bytes);
  return type === 'jpeg' || type === 'png'
    ? { ok: true, type }
    : { ok: false, reason: 'unsupported_type' };
}

export const paymentQrMime = (type: PaymentQrType): PaymentQrMime =>
  type === 'png' ? 'image/png' : 'image/jpeg';

/** Clave en el almacén: `groups/<id>/qr/<uuid>.<ext>`. Nunca lleva el nombre que puso la persona. */
export function paymentQrKey(input: {
  groupId: string;
  fileId: string;
  type: PaymentQrType;
}): string {
  return `groups/${input.groupId}/qr/${input.fileId}.${input.type === 'png' ? 'png' : 'jpg'}`;
}

export type PaymentTextCheck =
  { ok: true; value: string | null } | { ok: false; reason: 'too_long' };

/** Texto sin espacios en los bordes; vacío equivale a «sin texto» (`null`). */
export function normalizePaymentText(raw: string): PaymentTextCheck {
  const value = raw.trim();
  if (value.length > MAX_PAYMENT_INFO_TEXT) return { ok: false, reason: 'too_long' };
  return { ok: true, value: value === '' ? null : value };
}

export interface StoredPaymentInfo {
  text: string | null;
  qrKey: string | null;
  qrMime: PaymentQrMime | null;
}

export interface PaymentInfoChange {
  /** `undefined`: no se toca el texto. */
  text?: string | null;
  /** QR ya guardado en el almacén, a punto de reemplazar al actual. */
  newQr?: { key: string; mime: PaymentQrMime };
  removeQr?: boolean;
}

export interface PaymentInfoPlan {
  next: StoredPaymentInfo;
  /** Clave del QR anterior que deja de usarse: se borra solo tras confirmar el cambio. */
  obsoleteQrKey: string | null;
}

/** Resultado de aplicar el cambio a lo guardado; lo que no se menciona se conserva. */
export function planPaymentInfoChange(
  current: StoredPaymentInfo,
  change: PaymentInfoChange,
): PaymentInfoPlan {
  const text = change.text === undefined ? current.text : change.text;
  if (change.newQr) {
    const replaced = current.qrKey !== null && current.qrKey !== change.newQr.key;
    return {
      next: { text, qrKey: change.newQr.key, qrMime: change.newQr.mime },
      obsoleteQrKey: replaced ? current.qrKey : null,
    };
  }
  if (change.removeQr) {
    return { next: { text, qrKey: null, qrMime: null }, obsoleteQrKey: current.qrKey };
  }
  return { next: { ...current, text }, obsoleteQrKey: null };
}
