// Ayudas del cliente para el comprobante de pago (RF-002-06, plan 002 §6). Solo avisan antes de
// subir: el servidor valida siempre el tipo real (firma binaria) y el tamaño (RNF-002-02).

/** Tipos que acepta el selector de archivos: JPG, PNG o PDF. */
export const RECEIPT_ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'application/pdf'] as const;

/** 5 MB, el máximo de la spec 002. */
export const RECEIPT_MAX_BYTES = 5 * 1024 * 1024;

/** Largo máximo de la referencia de la transacción (RF-002-07). */
export const RECEIPT_REFERENCE_MAX = 100;

const EXTENSION_TYPES: Record<string, (typeof RECEIPT_ACCEPTED_TYPES)[number]> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  pdf: 'application/pdf',
};

/** Tipo del archivo: el que informa el navegador o, si viene vacío, el de la extensión. */
export function receiptFileType(file: Pick<File, 'name' | 'type'>): string {
  if (file.type) return file.type;
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  return EXTENSION_TYPES[extension] ?? '';
}

/** `'type'` si no es JPG, PNG o PDF; `'size'` si pesa más de 5 MB; `null` si se puede enviar. */
export function checkReceiptFile(
  file: Pick<File, 'name' | 'type' | 'size'>,
): 'type' | 'size' | null {
  if (!(RECEIPT_ACCEPTED_TYPES as readonly string[]).includes(receiptFileType(file))) return 'type';
  if (file.size > RECEIPT_MAX_BYTES) return 'size';
  return null;
}

/** Peso legible con coma decimal: `860 KB`, `1,2 MB`. */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  const tenths = Math.round((bytes / (1024 * 1024)) * 10) / 10;
  return `${String(tenths).replace('.', ',')} MB`;
}
