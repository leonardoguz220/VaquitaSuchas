import { describe, expect, it } from '@jest/globals';
import { decodeListCursor, encodeListCursor } from './list-cursor.js';

const ID = '0b9c6a4e-1f2d-4c3b-8a7e-5d6f7a8b9c0d';

describe('list cursor', () => {
  it('ida y vuelta', () => {
    const dueAt = new Date('2026-10-19T04:00:00.000Z');
    expect(decodeListCursor(encodeListCursor({ dueAt, id: ID }))).toEqual({ dueAt, id: ID });
  });

  it('rechaza textos inválidos', () => {
    expect(decodeListCursor('basura')).toBeNull();
    expect(decodeListCursor(Buffer.from('2026-10-19|x').toString('base64url'))).toBeNull();
  });
});
