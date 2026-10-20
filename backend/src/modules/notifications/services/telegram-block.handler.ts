import { Injectable } from '@nestjs/common';
import type { ParsedUpdate } from '../../telegram/domain/telegram-update.js';
import type { TelegramUpdateHandler } from '../../telegram/ports/telegram.gateway.js';
import { PreferencesService } from './preferences.service.js';

/**
 * Manejador de `my_chat_member` (RF-005-28, CA-005-33): si la persona bloquea el bot se marca
 * `telegram_blocked_at`; el celular sigue verificado y los avisos de la app no cambian. Desbloquear
 * no reactiva solo: la persona lo hace con «Reactivar».
 */
@Injectable()
export class TelegramBlockHandler implements TelegramUpdateHandler {
  constructor(private readonly preferences: PreferencesService) {}

  async handle(update: ParsedUpdate): Promise<void> {
    if (update.command.type !== 'bot_status' || !update.command.blocked) return;
    if (update.telegramUserId === undefined) return;
    await this.preferences.markTelegramBlocked(update.telegramUserId);
  }
}
