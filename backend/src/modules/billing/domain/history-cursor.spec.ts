import { decodeHistoryCursor, encodeHistoryCursor } from './history-cursor.js';

const ID = '3f2b8a52-1c3e-4a77-9a55-0d3b6f1f2a10';

describe('cursor del historial (RF-002-17)', () => {
  it('RF-002-17: ida y vuelta conserva período, emisión e id', () => {
    const cursor = { period: '2026-10', issuedAt: new Date('2026-10-15T04:00:00.000Z'), id: ID };
    expect(decodeHistoryCursor(encodeHistoryCursor(cursor))).toEqual(cursor);
  });

  it.each([
    '',
    'basura',
    Buffer.from('2026-13|2026-10-15T04:00:00.000Z|' + ID).toString('base64url'),
    Buffer.from('2026-10|ayer|' + ID).toString('base64url'),
    Buffer.from('2026-10|2026-10-15T04:00:00.000Z|no-uuid').toString('base64url'),
    Buffer.from('2026-10|2026-10-15T04:00:00.000Z|' + ID + '|x').toString('base64url'),
  ])('RF-002-17: rechaza un cursor mal formado (%#)', (text) => {
    expect(decodeHistoryCursor(text)).toBeNull();
  });
});
