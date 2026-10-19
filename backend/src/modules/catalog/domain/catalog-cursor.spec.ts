import { decodeServiceCursor, encodeServiceCursor } from './catalog-cursor.js';

describe('cursor del listado del catálogo', () => {
  it('RF-004-02: ida y vuelta sobre (nombre, id)', () => {
    const cursor = encodeServiceCursor({
      name: 'Música+ ñandú',
      id: '7f6c5f0e-0000-4000-8000-000000000001',
    });
    expect(decodeServiceCursor(cursor)).toEqual({
      name: 'Música+ ñandú',
      id: '7f6c5f0e-0000-4000-8000-000000000001',
    });
  });

  it('RF-004-02: un cursor mal formado se rechaza con null', () => {
    for (const bad of [
      '',
      'no-es-base64!',
      Buffer.from('{}').toString('base64url'),
      Buffer.from('[1]').toString('base64url'),
    ]) {
      expect(decodeServiceCursor(bad)).toBeNull();
    }
  });
});
