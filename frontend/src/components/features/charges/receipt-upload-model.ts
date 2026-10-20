import { NETWORK_ERROR_CODE, type ApiError } from '@/services/http';

/** Ayuda en el cliente; el backend valida el tipo real y el tamaño (413 y 415). */
export const RECEIPT_ACCEPT = 'image/jpeg,image/png,application/pdf';
export const RECEIPT_TYPES = ['image/jpeg', 'image/png', 'application/pdf'] as const;
export const RECEIPT_MAX_BYTES = 5 * 1024 * 1024;
export const REFERENCE_MAX_LENGTH = 100;

export const RECEIPT_MESSAGES = {
  fileMissing: 'Elige la foto o el PDF de tu comprobante.',
  fileType: 'Solo se aceptan archivos JPG, PNG o PDF.',
  fileSize: 'El archivo supera 5 MB. Elige uno más liviano.',
  referenceMissing: 'Escribe la referencia que aparece en tu comprobante.',
  referenceTooLong: 'La referencia puede tener hasta 100 caracteres.',
  referenceUsed: 'Esa referencia ya fue usada en este grupo',
  stale: 'Otra persona modificó el cobro; recargamos los datos',
  storage: 'No pudimos guardar el archivo, intenta de nuevo',
  storageDetail: 'El cobro no cambió.',
  invalidTransition: 'Este cobro ya no admite cambios.',
  frozen: 'El grupo está congelado por ahora y no recibe comprobantes.',
  validation: 'Revisa el método y la referencia del comprobante.',
  offline: 'Sin conexión con el servidor. Revisa tu internet e intenta de nuevo.',
  generic: 'No pudimos enviar el comprobante. Intenta de nuevo.',
  success: 'Comprobante enviado; el titular lo revisará',
} as const;

export function validateReceiptFile(file: File): string | null {
  if (!(RECEIPT_TYPES as readonly string[]).includes(file.type)) return RECEIPT_MESSAGES.fileType;
  if (file.size > RECEIPT_MAX_BYTES) return RECEIPT_MESSAGES.fileSize;
  return null;
}

export function validateReference(reference: string): string | null {
  const trimmed = reference.trim();
  if (trimmed.length === 0) return RECEIPT_MESSAGES.referenceMissing;
  if (trimmed.length > REFERENCE_MAX_LENGTH) return RECEIPT_MESSAGES.referenceTooLong;
  return null;
}

export type ReceiptUploadError =
  | { target: 'reference' | 'file'; message: string }
  | { target: 'form'; variant: 'error' | 'warning'; title: string; detail?: string };

/** Traduce el error de la API por `code` (contrato A.2), nunca por `message`. */
export function receiptUploadError(error: ApiError): ReceiptUploadError {
  switch (error.code) {
    case 'REFERENCE_ALREADY_USED':
      return { target: 'reference', message: RECEIPT_MESSAGES.referenceUsed };
    case 'FILE_TOO_LARGE':
      return { target: 'file', message: RECEIPT_MESSAGES.fileSize };
    case 'UNSUPPORTED_FILE_TYPE':
      return { target: 'file', message: RECEIPT_MESSAGES.fileType };
    case 'STALE_STATE':
      return { target: 'form', variant: 'warning', title: RECEIPT_MESSAGES.stale };
    case 'INVALID_TRANSITION':
      return { target: 'form', variant: 'error', title: RECEIPT_MESSAGES.invalidTransition };
    case 'GROUP_FROZEN':
      return { target: 'form', variant: 'error', title: RECEIPT_MESSAGES.frozen };
    case 'VALIDATION_ERROR':
      return { target: 'form', variant: 'error', title: RECEIPT_MESSAGES.validation };
    case 'SERVICE_UNAVAILABLE':
      return {
        target: 'form',
        variant: 'error',
        title: RECEIPT_MESSAGES.storage,
        detail: RECEIPT_MESSAGES.storageDetail,
      };
    default:
      if (error.code === NETWORK_ERROR_CODE || error.statusCode === 504) {
        return { target: 'form', variant: 'error', title: RECEIPT_MESSAGES.offline };
      }
      return { target: 'form', variant: 'error', title: RECEIPT_MESSAGES.generic };
  }
}
