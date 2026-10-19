import { Injectable, Logger } from '@nestjs/common';
import type { ParsedUpdate } from '../domain/telegram-update.js';
import type { TelegramUpdateHandler } from '../ports/telegram.gateway.js';

/** Reparte cada actualización nueva a los manejadores que registran otras specs (003). */
@Injectable()
export class TelegramDispatcher {
  private readonly logger = new Logger(TelegramDispatcher.name);
  private readonly handlers: TelegramUpdateHandler[] = [];

  register(handler: TelegramUpdateHandler): void {
    this.handlers.push(handler);
  }

  async dispatch(update: ParsedUpdate): Promise<void> {
    for (const handler of this.handlers) {
      try {
        await handler.handle(update);
      } catch (error) {
        // Solo el nombre del error: el mensaje puede traer datos personales.
        this.logger.error(`Falló un manejador de Telegram (${(error as Error).name}).`);
      }
    }
  }
}
