import { decodeChargeCursor, encodeChargeCursor } from './charge-cursor.js';

const ID = '0b5f3e0e-6a64-4c63-8d0b-1f8e3f2b7a11';

describe('cursor de "Mis cobros"', () => {
  it('RF-002-15: codifica y decodifica sin perder el instante ni el id', () => {
    const cursor = { dueAt: new Date('2026-10-19T04:00:00.000Z'), id: ID };
    expect(decodeChargeCursor(encodeChargeCursor(cursor))).toEqual(cursor);
  });

  it('RF-002-15: un texto manipulado se rechaza', () => {
    expect(decodeChargeCursor('no-es-un-cursor')).toBeNull();
    expect(decodeChargeCursor('')).toBeNull();
    const badDate = Buffer.from(`ayer|${ID}`).toString('base64url');
    expect(decodeChargeCursor(badDate)).toBeNull();
    const badId = Buffer.from('2026-10-19T04:00:00.000Z|1; DROP TABLE charges').toString(
      'base64url',
    );
    expect(decodeChargeCursor(badId)).toBeNull();
    const extra = Buffer.from(`2026-10-19T04:00:00.000Z|${ID}|x`).toString('base64url');
    expect(decodeChargeCursor(extra)).toBeNull();
  });
});
