import { decodeCursor, encodeCursor } from './page-cursor.js';

describe('page-cursor (RF-010-26)', () => {
  const cursor = {
    openedAt: new Date('2026-10-16T15:00:00.000Z'),
    id: '3f2b8c1e-5d4a-4e6f-9a7b-1c2d3e4f5a6b',
  };

  it('ida y vuelta', () => {
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
  });

  it('rechaza cursores mal formados', () => {
    expect(decodeCursor('no-es-un-cursor')).toBeNull();
    expect(decodeCursor(Buffer.from('2026-10-16|x', 'utf8').toString('base64url'))).toBeNull();
    expect(decodeCursor('')).toBeNull();
  });
});
