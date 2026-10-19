import { parseUpdate } from '../domain/telegram-update.js';
import {
  TelegramDeliveryError,
  TelegramGateway,
  type TelegramMessage,
} from '../ports/telegram.gateway.js';

export type FetchFn = typeof fetch;
const TIMEOUT_MS = 10_000;

/** Bot real: HTTPS a api.telegram.org. Los errores no incluyen el token (va en la URL). */
export class HttpTelegramGateway extends TelegramGateway {
  constructor(
    private readonly botToken: string,
    private readonly fetchFn: FetchFn = fetch,
  ) {
    super();
  }

  async sendMessage(chatId: number, message: TelegramMessage): Promise<void> {
    const body: Record<string, unknown> = { chat_id: chatId, text: message.text };
    if (message.buttons?.length) {
      body.reply_markup = {
        keyboard: [
          message.buttons.map((b) => ({ text: b.text, request_contact: b.requestContact })),
        ],
        resize_keyboard: true,
        one_time_keyboard: true,
      };
    }
    let status: number;
    try {
      const response = await this.fetchFn(
        `https://api.telegram.org/bot${this.botToken}/sendMessage`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        },
      );
      status = response.status;
    } catch {
      throw new TelegramDeliveryError('No se pudo contactar a Telegram.');
    }
    if (status < 200 || status >= 300) {
      throw new TelegramDeliveryError(`Telegram rechazó el mensaje (HTTP ${status}).`);
    }
  }

  parseUpdate = parseUpdate;

  /** Registra el webhook (lo usa `cli/telegram-set-webhook.ts`). */
  async setWebhook(url: string, secretToken: string): Promise<void> {
    let status: number;
    try {
      const response = await this.fetchFn(
        `https://api.telegram.org/bot${this.botToken}/setWebhook`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ url, secret_token: secretToken }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        },
      );
      status = response.status;
    } catch {
      throw new TelegramDeliveryError('No se pudo contactar a Telegram.');
    }
    if (status < 200 || status >= 300) {
      throw new TelegramDeliveryError(`Telegram rechazó el webhook (HTTP ${status}).`);
    }
  }
}
