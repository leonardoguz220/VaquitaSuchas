import type { ParsedUpdate } from '../domain/telegram-update.js';

export interface TelegramButton {
  readonly text: string;
  /** Pide a la persona compartir su contacto (botón `request_contact`). */
  readonly requestContact?: boolean;
}

export interface TelegramMessage {
  readonly text: string;
  readonly buttons?: readonly TelegramButton[];
}

/** El bot no pudo enviar el mensaje. Nunca incluye el token ni la URL de la API. */
export class TelegramDeliveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TelegramDeliveryError';
  }
}

/** La persona bloqueó el bot (Telegram responde 403): no tiene sentido reintentar. */
export class TelegramBotBlockedError extends TelegramDeliveryError {
  constructor() {
    super('La persona bloqueó el bot.');
    this.name = 'TelegramBotBlockedError';
  }
}

/** Puerto del bot (RF-000-22): `dev` guarda los mensajes en memoria; `prod` llama a Telegram. */
export abstract class TelegramGateway {
  abstract sendMessage(chatId: number, message: TelegramMessage): Promise<void>;
  abstract parseUpdate(raw: unknown): ParsedUpdate | null;
}

/** Manejador de actualizaciones que registra otra spec (003) en el despachador. */
export interface TelegramUpdateHandler {
  handle(update: ParsedUpdate): Promise<void>;
}
