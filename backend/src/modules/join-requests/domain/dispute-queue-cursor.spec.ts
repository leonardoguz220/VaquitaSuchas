import { decodeDisputeQueueCursor, encodeDisputeQueueCursor } from './dispute-queue-cursor.js';

describe('cursor de la cola de reclamos (RF-009-20)', () => {
  const cursor = {
    rank: 1 as const,
    openedAt: '2026-10-01T10:00:00.123456Z',
    id: '3f2b8c1e-6f4a-4d6e-9b1a-0c5d7e8f9a10',
  };

  it('RF-009-20: ida y vuelta conserva la posición', () => {
    expect(decodeDisputeQueueCursor(encodeDisputeQueueCursor(cursor))).toEqual(cursor);
  });

  it('RF-009-20: un texto manipulado se rechaza', () => {
    for (const bad of ['', 'basura', Buffer.from('2|x|y').toString('base64url')]) {
      expect(decodeDisputeQueueCursor(bad)).toBeNull();
    }
  });
});
