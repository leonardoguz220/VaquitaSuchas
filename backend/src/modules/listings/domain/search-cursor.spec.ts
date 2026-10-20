import { decodeSearchCursor, encodeSearchCursor } from './search-cursor.js';

const cursor = {
  sort: 'cuota',
  key: 3000,
  publishedAt: '2026-10-16T15:00:00.123456Z',
  id: '0b7f4c1e-2d3a-4b5c-8d9e-1f2a3b4c5d6e',
} as const;

describe('cursor de búsqueda (RF-008-09)', () => {
  it('RF-008-09: ida y vuelta sin perder precisión', () => {
    expect(decodeSearchCursor(encodeSearchCursor(cursor), 'cuota')).toEqual(cursor);
  });

  it('RF-008-09: rechaza basura, otro orden y campos inválidos', () => {
    expect(decodeSearchCursor('zzz', 'cuota')).toBeNull();
    expect(decodeSearchCursor(encodeSearchCursor(cursor), 'fecha')).toBeNull();
    expect(
      decodeSearchCursor(encodeSearchCursor({ ...cursor, id: 'no-es-uuid' }), 'cuota'),
    ).toBeNull();
    expect(
      decodeSearchCursor(encodeSearchCursor({ ...cursor, publishedAt: '2026-10-16' }), 'cuota'),
    ).toBeNull();
  });
});
