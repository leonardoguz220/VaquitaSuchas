import { InvalidStorageKeyError } from '../../ports/file-storage.js';
import {
  encodeKeyForUrl,
  MAX_KEY_LENGTH,
  MAX_SIGNED_URL_SECONDS,
  validateSignedUrlTtl,
  validateStorageKey,
} from './storage-key.js';

describe('validateStorageKey', () => {
  it.each(['a.png', 'receipts/9b2f/comprobante-1_final.pdf', 'qr/v1/pago.webp'])(
    'RF-000-12: acepta la clave %s',
    (key) => {
      expect(() => validateStorageKey(key)).not.toThrow();
    },
  );

  it.each([
    ['vacía', ''],
    ['con barra inicial', '/receipts/a.png'],
    ['con barra final', 'receipts/'],
    ['con tramo vacío', 'receipts//a.png'],
    ['con «..»', 'receipts/../secret.png'],
    ['con «.»', './a.png'],
    ['con barra invertida', 'receipts\\a.png'],
    ['con espacio', 'receipts/mi archivo.png'],
    ['con salto de línea', 'receipts/a\n.png'],
    ['con porcentaje', 'receipts/%2e%2e'],
    ['con byte nulo', 'a\0.png'],
    ['demasiado larga', 'a'.repeat(MAX_KEY_LENGTH + 1)],
  ])('RF-000-12: rechaza la clave %s', (_name, key) => {
    expect(() => validateStorageKey(key)).toThrow(InvalidStorageKeyError);
  });

  it('RF-000-12: rechaza lo que no es texto', () => {
    expect(() => validateStorageKey(undefined as unknown as string)).toThrow(
      InvalidStorageKeyError,
    );
  });
});

describe('validateSignedUrlTtl', () => {
  it.each([1, 60, MAX_SIGNED_URL_SECONDS])('RF-000-12: acepta %d segundos', (ttl) => {
    expect(() => validateSignedUrlTtl(ttl)).not.toThrow();
  });

  it.each([0, -1, 1.5, Number.NaN, Infinity, MAX_SIGNED_URL_SECONDS + 1])(
    'RF-000-12: rechaza %p segundos',
    (ttl) => {
      expect(() => validateSignedUrlTtl(ttl)).toThrow(InvalidStorageKeyError);
    },
  );
});

describe('encodeKeyForUrl', () => {
  it('RF-000-12: conserva las barras y codifica cada tramo', () => {
    expect(encodeKeyForUrl('receipts/a b/ñ.png')).toBe('receipts/a%20b/%C3%B1.png');
  });
});
