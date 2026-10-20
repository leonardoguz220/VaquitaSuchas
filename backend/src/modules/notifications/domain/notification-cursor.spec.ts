import { decodeNotificationCursor, encodeNotificationCursor } from './notification-cursor.js';

const cursor = {
  createdAt: '2026-10-19T12:00:00.123456Z',
  id: '11111111-1111-4111-8111-111111111111',
};

describe('cursor de notificaciones (RF-005-01)', () => {
  it('RF-005-01: ida y vuelta', () => {
    expect(decodeNotificationCursor(encodeNotificationCursor(cursor))).toEqual(cursor);
  });

  it('RF-005-01: rechaza textos que no son un cursor', () => {
    for (const bad of [
      '',
      'xxx',
      Buffer.from('a|b').toString('base64url'),
      Buffer.from(`${cursor.createdAt}|${cursor.id}|extra`).toString('base64url'),
      Buffer.from(`2026-10-19|${cursor.id}`).toString('base64url'),
    ]) {
      expect(decodeNotificationCursor(bad)).toBeNull();
    }
  });
});
