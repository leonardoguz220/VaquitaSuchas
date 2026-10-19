import request from 'supertest';
import type { BillingHarness } from './billing-harness.js';

// Archivos de prueba con la firma binaria real de cada formato (research R4).

function withSignature(signature: readonly number[], size: number): Buffer {
  const buffer = Buffer.alloc(size, 0x61);
  Buffer.from(signature).copy(buffer);
  return buffer;
}

export const jpegBytes = (size = 2 * 1024 * 1024): Buffer =>
  withSignature([0xff, 0xd8, 0xff], size);
export const pngBytes = (size = 1024): Buffer => withSignature([0x89, 0x50, 0x4e, 0x47], size);
export const pdfBytes = (size = 1024): Buffer =>
  withSignature([0x25, 0x50, 0x44, 0x46, 0x2d], size);
/** Ejecutable de Windows: empieza con "MZ". */
export const exeBytes = (size = 1024): Buffer => withSignature([0x4d, 0x5a], size);

export interface UploadOptions {
  file?: { bytes: Buffer; filename: string; contentType?: string } | null;
  method?: string | null;
  reference?: string | null;
  version?: number;
}

/** `POST /charges/:id/receipts` como multipart; por omisión un JPG válido por QR. */
export function uploadReceipt(
  harness: BillingHarness,
  userId: string,
  chargeId: string,
  options: UploadOptions = {},
): request.Test {
  const file =
    options.file === undefined
      ? { bytes: jpegBytes(), filename: 'comprobante.jpg', contentType: 'image/jpeg' }
      : options.file;
  const method = options.method === undefined ? 'qr' : options.method;
  const reference = options.reference === undefined ? 'TX-0001' : options.reference;
  let call = request(harness.app.getHttpServer())
    .post(`/charges/${chargeId}/receipts`)
    .set('Authorization', `Bearer ${harness.token(userId)}`);
  if (method !== null) call = call.field('method', method);
  if (reference !== null) call = call.field('reference', reference);
  if (options.version !== undefined) call = call.field('version', String(options.version));
  if (file !== null) {
    call = call.attach('file', file.bytes, {
      filename: file.filename,
      contentType: file.contentType ?? 'application/octet-stream',
    });
  }
  return call;
}
