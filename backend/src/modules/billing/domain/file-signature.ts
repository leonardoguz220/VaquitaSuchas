export type ReceiptFileType = 'jpeg' | 'png' | 'pdf';

export const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;

const startsWith = (bytes: Uint8Array, signature: readonly number[]): boolean =>
  bytes.length >= signature.length && signature.every((b, i) => bytes[i] === b);

/** Tipo real por firma binaria (research R4), sin confiar en el nombre ni el MIME. */
export function detectFileType(bytes: Uint8Array): ReceiptFileType | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'jpeg';
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47])) return 'png';
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'pdf';
  return null;
}

export type ReceiptFileCheck =
  | { ok: true; type: ReceiptFileType }
  | { ok: false; reason: 'empty' | 'too_large' | 'unsupported_type' };

/** Tamaño (≤ 5 MB) y tipo real (JPG, PNG o PDF) de un comprobante (CA-002-05). */
export function checkReceiptFile(bytes: Uint8Array): ReceiptFileCheck {
  if (bytes.length === 0) return { ok: false, reason: 'empty' };
  if (bytes.length > MAX_RECEIPT_BYTES) return { ok: false, reason: 'too_large' };
  const type = detectFileType(bytes);
  return type ? { ok: true, type } : { ok: false, reason: 'unsupported_type' };
}
