import { parseUpdate } from '../domain/telegram-update.js';
import { TelegramGateway, type TelegramMessage } from '../ports/telegram.gateway.js';

/** Bot de desarrollo: guarda en memoria lo que "envía" y no sale a internet. */
export class DevTelegramGateway extends TelegramGateway {
  private readonly outbox = new Map<number, TelegramMessage[]>();

  async sendMessage(chatId: number, message: TelegramMessage): Promise<void> {
    const list = this.outbox.get(chatId) ?? [];
    list.push(message);
    this.outbox.set(chatId, list);
  }

  parseUpdate = parseUpdate;

  messagesFor(chatId: number): readonly TelegramMessage[] {
    return [...(this.outbox.get(chatId) ?? [])];
  }
}
