import { chatRateAllowed, unreadCount, validateChatMessage } from './chat-rules.js';

const png = (size = 16): Uint8Array => {
  const b = new Uint8Array(size);
  b.set([0x89, 0x50, 0x4e, 0x47]);
  return b;
};
const jpg = (size = 16): Uint8Array => {
  const b = new Uint8Array(size);
  b.set([0xff, 0xd8, 0xff]);
  return b;
};
const pdf = (): Uint8Array => Uint8Array.from(Buffer.from('%PDF-1.7 contenido'));

describe('validateChatMessage', () => {
  it('RF-010-05: acepta texto, imagen o ambos', () => {
    expect(validateChatMessage('hola', null)).toEqual([]);
    expect(validateChatMessage(null, png())).toEqual([]);
    expect(validateChatMessage('mira', jpg())).toEqual([]);
  });

  it('RF-010-05: rechaza mensajes vacíos', () => {
    expect(validateChatMessage(null, null)).toEqual(['empty']);
    expect(validateChatMessage('   ', null)).toEqual(['empty']);
  });

  it('CA-010-21: 1.000 caracteres sí, 1.001 no', () => {
    expect(validateChatMessage('a'.repeat(1000), null)).toEqual([]);
    expect(validateChatMessage('a'.repeat(1001), null)).toEqual(['text_too_long']);
  });

  it('CA-010-21: un PDF adjunto se rechaza', () => {
    expect(validateChatMessage('hola', pdf())).toEqual(['image_type']);
  });

  it('RF-010-05: la imagen no pasa de 5 MB', () => {
    expect(validateChatMessage(null, png(5 * 1024 * 1024))).toEqual([]);
    expect(validateChatMessage(null, png(5 * 1024 * 1024 + 1))).toEqual(['image_too_large']);
  });
});

describe('unreadCount', () => {
  const messages = [
    { seq: 1, senderId: 'a' },
    { seq: 2, senderId: 'b' },
    { seq: 3, senderId: 'b' },
    { seq: 4, senderId: 'a' },
  ];

  it('RF-010-09: cuenta solo mensajes ajenos posteriores a lastReadSeq', () => {
    expect(unreadCount(messages, 0, 'a')).toBe(2);
    expect(unreadCount(messages, 2, 'a')).toBe(1);
    expect(unreadCount(messages, 3, 'a')).toBe(0);
    expect(unreadCount(messages, 0, 'b')).toBe(2);
  });
});

describe('chatRateAllowed', () => {
  const now = new Date('2026-10-10T12:00:00Z');
  const secsAgo = (n: number): Date => new Date(now.getTime() - n * 1000);

  it('RF-010-10: permite hasta 20 mensajes por minuto', () => {
    expect(
      chatRateAllowed(
        Array.from({ length: 19 }, () => secsAgo(5)),
        now,
      ),
    ).toBe(true);
    expect(
      chatRateAllowed(
        Array.from({ length: 20 }, () => secsAgo(5)),
        now,
      ),
    ).toBe(false);
  });

  it('RF-010-10: los mensajes de hace más de un minuto no cuentan', () => {
    expect(
      chatRateAllowed(
        Array.from({ length: 30 }, () => secsAgo(61)),
        now,
      ),
    ).toBe(true);
  });
});
