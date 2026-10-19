export type RequestFileType = 'jpeg' | 'png' | 'pdf';

const EXTENSION: Record<RequestFileType, string> = { jpeg: 'jpg', png: 'png', pdf: 'pdf' };

interface KeyInput {
  groupId: string;
  requestId: string;
  fileId: string;
  type: RequestFileType;
}

/** Clave del comprobante en el almacén (RNF-010-02): generada por el servidor, sin el nombre original. */
export const proofKeyOf = (i: KeyInput): string =>
  `join-requests/${i.groupId}/${i.requestId}/proof-${i.fileId}.${EXTENSION[i.type]}`;

/** Clave de la copia propia del QR de pago de la solicitud (plan, decisión de archivos). */
export const paymentQrKeyOf = (i: KeyInput): string =>
  `join-requests/${i.groupId}/${i.requestId}/qr-${i.fileId}.${EXTENSION[i.type]}`;
