import type { ReceiptFileType } from './file-signature.js';

/** Vigencia máxima de las URLs firmadas de comprobantes (RNF-002-01). */
export const RECEIPT_URL_TTL_SECONDS = 600;

export type ReceiptMimeType = 'image/jpeg' | 'image/png' | 'application/pdf';

const MIME: Record<ReceiptFileType, ReceiptMimeType> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  pdf: 'application/pdf',
};

const EXTENSION: Record<ReceiptFileType, string> = { jpeg: 'jpg', png: 'png', pdf: 'pdf' };

/** MIME que se guarda: sale de la firma binaria, nunca de lo que declaró el cliente. */
export const mimeOfFileType = (type: ReceiptFileType): ReceiptMimeType => MIME[type];

/**
 * Clave del archivo en el almacén (research R4): la genera el servidor; nunca lleva el nombre que
 * puso la persona.
 */
export function receiptStorageKey(input: {
  groupId: string;
  chargeId: string;
  fileId: string;
  type: ReceiptFileType;
}): string {
  return `receipts/${input.groupId}/${input.chargeId}/${input.fileId}.${EXTENSION[input.type]}`;
}

/**
 * Un PDF se descarga en lugar de abrirse en la página (plan §7, `Content-Disposition:
 * attachment`): se le agrega `download` a la URL firmada, que el almacén traduce a esa cabecera.
 */
export function withDownloadHint(url: string, mime: ReceiptMimeType): string {
  if (mime !== 'application/pdf') return url;
  return `${url}${url.includes('?') ? '&' : '?'}download=comprobante.pdf`;
}
