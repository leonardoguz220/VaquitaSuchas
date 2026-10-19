/** Orden que el bot entiende de una actualización de Telegram (spec 000 RF-000-22; la spec 003 la usa). */
export type TelegramCommand =
  | { readonly type: 'start'; readonly token?: string }
  | { readonly type: 'contact'; readonly phoneNumber: string; readonly contactUserId?: number }
  | { readonly type: 'other' };

export interface ParsedUpdate {
  readonly updateId: number;
  readonly telegramUserId?: number;
  readonly chatId?: number;
  readonly command: TelegramCommand;
}

export interface SimulatedUpdateInput {
  readonly kind: 'start' | 'contact';
  readonly telegramUserId: number;
  readonly token?: string;
  readonly phoneNumber?: string;
  readonly contactUserId?: number;
}

type Obj = Record<string, unknown>;

const isObj = (value: unknown): value is Obj =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isId = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

const START = /^\/start(?:@\w+)?(?:\s+(\S+))?\s*$/;

function commandOf(message: Obj): TelegramCommand {
  const contact = message.contact;
  if (isObj(contact) && typeof contact.phone_number === 'string') {
    return {
      type: 'contact',
      phoneNumber: contact.phone_number,
      ...(isId(contact.user_id) ? { contactUserId: contact.user_id } : {}),
    };
  }
  if (typeof message.text === 'string') {
    const match = START.exec(message.text.trim());
    if (match) return { type: 'start', ...(match[1] ? { token: match[1] } : {}) };
  }
  return { type: 'other' };
}

/** Lee un `Update` crudo de Telegram. Devuelve `null` si no trae un `update_id` válido. */
export function parseUpdate(raw: unknown): ParsedUpdate | null {
  if (!isObj(raw) || !isId(raw.update_id)) return null;
  const message = isObj(raw.message) ? raw.message : null;
  if (!message) return { updateId: raw.update_id, command: { type: 'other' } };
  const from = isObj(message.from) ? message.from : null;
  const chat = isObj(message.chat) ? message.chat : null;
  return {
    updateId: raw.update_id,
    ...(from && isId(from.id) ? { telegramUserId: from.id } : {}),
    ...(chat && isId(chat.id) ? { chatId: chat.id } : {}),
    command: commandOf(message),
  };
}

/** Construye un `Update` con la misma forma que el de Telegram (solo modo `dev`). */
export function buildSimulatedUpdate(input: SimulatedUpdateInput, updateId: number): Obj {
  const base = { from: { id: input.telegramUserId }, chat: { id: input.telegramUserId } };
  if (input.kind === 'start') {
    const text = input.token ? `/start ${input.token}` : '/start';
    return { update_id: updateId, message: { ...base, text } };
  }
  return {
    update_id: updateId,
    message: {
      ...base,
      contact: {
        phone_number: input.phoneNumber ?? '',
        user_id: input.contactUserId ?? input.telegramUserId,
      },
    },
  };
}
