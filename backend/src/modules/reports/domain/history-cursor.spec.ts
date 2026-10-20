import { describe, expect, it } from '@jest/globals';
import { decodeHistoryCursor, encodeHistoryCursor } from './history-cursor.js';

const ID = '0b9c6a4e-1f2d-4c3b-8a7e-5d6f7a8b9c0d';

describe('history cursor', () => {
  it('ida y vuelta', () => {
    expect(decodeHistoryCursor(encodeHistoryCursor({ period: '2026-10', id: ID }))).toEqual({
      period: '2026-10',
      id: ID,
    });
  });

  it('rechaza textos inválidos', () => {
    expect(decodeHistoryCursor('basura')).toBeNull();
    expect(decodeHistoryCursor(Buffer.from(`2026-13|${ID}`).toString('base64url'))).toBeNull();
  });
});
