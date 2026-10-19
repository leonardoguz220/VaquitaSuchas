import {
  checkChatImage,
  checkReceiptFile,
  formatFileSize,
  RECEIPT_MAX_BYTES,
  receiptFileType,
} from './receipt-file';

const file = (name: string, type: string, size = 1000) => ({ name, type, size });

describe('lib/receipt-file (RF-002-06, solo ayuda del cliente)', () => {
  it('CA-002-04: acepta un JPG de 2 MB, un PNG y un PDF', () => {
    expect(checkReceiptFile(file('pago.jpg', 'image/jpeg', 2 * 1024 * 1024))).toBeNull();
    expect(checkReceiptFile(file('pago.png', 'image/png'))).toBeNull();
    expect(checkReceiptFile(file('pago.pdf', 'application/pdf'))).toBeNull();
  });

  it('CA-002-05: avisa de un archivo de 6 MB y de un .exe', () => {
    expect(checkReceiptFile(file('pago.jpg', 'image/jpeg', 6 * 1024 * 1024))).toBe('size');
    expect(checkReceiptFile(file('pago.jpg', 'image/jpeg', RECEIPT_MAX_BYTES))).toBeNull();
    expect(checkReceiptFile(file('virus.exe', 'application/x-msdownload'))).toBe('type');
    expect(checkReceiptFile(file('virus.exe', ''))).toBe('type');
  });

  it('RF-002-06: sin tipo del navegador usa la extensión', () => {
    expect(receiptFileType(file('PAGO.JPEG', ''))).toBe('image/jpeg');
    expect(receiptFileType(file('pago.pdf', ''))).toBe('application/pdf');
    expect(receiptFileType(file('pago', ''))).toBe('');
  });

  it('formatFileSize usa KB o MB con coma decimal', () => {
    expect(formatFileSize(880640)).toBe('860 KB');
    expect(formatFileSize(1258291)).toBe('1,2 MB');
    expect(formatFileSize(5 * 1024 * 1024)).toBe('5 MB');
    expect(formatFileSize(10)).toBe('1 KB');
  });
});

describe('checkChatImage (spec 010)', () => {
  it('CA-010-21: acepta JPG y PNG de hasta 5 MB y rechaza un PDF', () => {
    expect(checkChatImage({ name: 'a.jpg', type: 'image/jpeg', size: 3 * 1024 * 1024 })).toBeNull();
    expect(checkChatImage({ name: 'a.png', type: '', size: 10 })).toBeNull();
    expect(checkChatImage({ name: 'a.pdf', type: 'application/pdf', size: 10 })).toBe('type');
  });

  it('RF-010-05: una imagen de más de 5 MB se avisa', () => {
    expect(checkChatImage({ name: 'a.jpg', type: 'image/jpeg', size: 5 * 1024 * 1024 + 1 })).toBe(
      'size',
    );
  });
});
