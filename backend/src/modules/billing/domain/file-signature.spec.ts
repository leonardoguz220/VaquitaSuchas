import { checkReceiptFile, detectFileType, MAX_RECEIPT_BYTES } from './file-signature.js';

const withHeader = (header: number[], size = 64): Uint8Array => {
  const bytes = new Uint8Array(size);
  bytes.set(header);
  return bytes;
};

const JPEG = [0xff, 0xd8, 0xff, 0xe0];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PDF = [...Buffer.from('%PDF-1.7')];
const EXE = [0x4d, 0x5a, 0x90, 0x00]; // "MZ"

describe('detectFileType', () => {
  it('CA-002-05: reconoce JPG, PNG y PDF por su firma', () => {
    expect(detectFileType(withHeader(JPEG))).toBe('jpeg');
    expect(detectFileType(withHeader(PNG))).toBe('png');
    expect(detectFileType(withHeader(PDF))).toBe('pdf');
  });

  it('CA-002-05: un .exe (MZ) o bytes desconocidos devuelven null', () => {
    expect(detectFileType(withHeader(EXE))).toBeNull();
    expect(detectFileType(new Uint8Array([1, 2, 3]))).toBeNull();
    expect(detectFileType(new Uint8Array(0))).toBeNull();
  });

  it('CA-002-05: una firma incompleta no cuenta', () => {
    expect(detectFileType(new Uint8Array([0xff, 0xd8]))).toBeNull();
    expect(detectFileType(Uint8Array.from(Buffer.from('%PDF')))).toBeNull();
  });
});

describe('checkReceiptFile', () => {
  it('CA-002-05: acepta hasta 5 MB exactos', () => {
    expect(checkReceiptFile(withHeader(PNG, MAX_RECEIPT_BYTES))).toEqual({ ok: true, type: 'png' });
  });

  it('CA-002-05: rechaza un archivo de 6 MB', () => {
    expect(checkReceiptFile(withHeader(JPEG, 6 * 1024 * 1024))).toEqual({
      ok: false,
      reason: 'too_large',
    });
  });

  it('CA-002-05: rechaza un .exe aunque el tamaño sea válido', () => {
    expect(checkReceiptFile(withHeader(EXE))).toEqual({ ok: false, reason: 'unsupported_type' });
  });

  it('CA-002-05: rechaza un archivo vacío', () => {
    expect(checkReceiptFile(new Uint8Array(0))).toEqual({ ok: false, reason: 'empty' });
  });
});
