import { mimeOfFileType, receiptStorageKey, withDownloadHint } from './receipt-file.js';

describe('archivo del comprobante', () => {
  it('RNF-002-02: el MIME guardado sale del tipo real detectado', () => {
    expect(mimeOfFileType('jpeg')).toBe('image/jpeg');
    expect(mimeOfFileType('png')).toBe('image/png');
    expect(mimeOfFileType('pdf')).toBe('application/pdf');
  });

  it('RNF-002-02: la clave es receipts/<grupo>/<cobro>/<uuid>.<ext> sin nombre del usuario', () => {
    const key = receiptStorageKey({ groupId: 'g1', chargeId: 'c1', fileId: 'f1', type: 'jpeg' });
    expect(key).toBe('receipts/g1/c1/f1.jpg');
    expect(receiptStorageKey({ groupId: 'g', chargeId: 'c', fileId: 'f', type: 'pdf' })).toBe(
      'receipts/g/c/f.pdf',
    );
  });

  it('RNF-002-01: solo el PDF lleva la indicación de descarga (attachment)', () => {
    expect(withDownloadHint('https://x.test/a?token=1', 'application/pdf')).toBe(
      'https://x.test/a?token=1&download=comprobante.pdf',
    );
    expect(withDownloadHint('/files/a.pdf', 'application/pdf')).toBe(
      '/files/a.pdf?download=comprobante.pdf',
    );
    expect(withDownloadHint('https://x.test/a?token=1', 'image/png')).toBe(
      'https://x.test/a?token=1',
    );
  });
});
