export const MAX_CHAT_TEXT_LENGTH = 1000;
export const MAX_CHAT_IMAGE_BYTES = 5 * 1024 * 1024;
export const CHAT_MESSAGES_PER_MINUTE = 20;

export type ChatRule = 'empty' | 'text_too_long' | 'image_too_large' | 'image_type';

const startsWith = (bytes: Uint8Array, sig: readonly number[]): boolean =>
  bytes.length >= sig.length && sig.every((b, i) => bytes[i] === b);

/** Imagen JPG o PNG por firma binaria (RF-010-05). */
export function isChatImage(bytes: Uint8Array): boolean {
  return startsWith(bytes, [0xff, 0xd8, 0xff]) || startsWith(bytes, [0x89, 0x50, 0x4e, 0x47]);
}

/** Texto de 1 a 1.000 caracteres, imagen JPG/PNG ≤ 5 MB, o ambos; al menos uno. Lista vacía = válido. */
export function validateChatMessage(text: string | null, image: Uint8Array | null): ChatRule[] {
  const broken: ChatRule[] = [];
  const hasText = text !== null && text.trim().length > 0;
  const hasImage = image !== null && image.length > 0;
  if (!hasText && !hasImage) return ['empty'];
  if (hasText && (text as string).length > MAX_CHAT_TEXT_LENGTH) broken.push('text_too_long');
  if (hasImage) {
    if ((image as Uint8Array).length > MAX_CHAT_IMAGE_BYTES) broken.push('image_too_large');
    if (!isChatImage(image as Uint8Array)) broken.push('image_type');
  }
  return broken;
}

export interface ChatMessageRef {
  seq: number;
  senderId: string;
}

/** Mensajes ajenos con `seq > lastReadSeq` (RF-010-09). */
export function unreadCount(
  messages: readonly ChatMessageRef[],
  lastReadSeq: number,
  userId: string,
): number {
  return messages.filter((m) => m.senderId !== userId && m.seq > lastReadSeq).length;
}

/** Máximo 20 mensajes por minuto por persona y solicitud (RF-010-10). */
export function chatRateAllowed(
  sentAt: readonly Date[],
  now: Date,
  limit = CHAT_MESSAGES_PER_MINUTE,
): boolean {
  const windowStart = now.getTime() - 60_000;
  return (
    sentAt.filter((d) => d.getTime() > windowStart && d.getTime() <= now.getTime()).length < limit
  );
}
