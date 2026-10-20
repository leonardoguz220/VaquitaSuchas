import { Injectable } from '@nestjs/common';
import { Clock } from '../../../shared/clock/clock.js';
import { TelegramGateway } from '../ports/telegram.gateway.js';
import { TelegramUpdatesRepository } from '../repositories/telegram-updates.repository.js';
import { TelegramDispatcher } from './telegram-dispatcher.js';

@Injectable()
export class TelegramWebhookService {
  constructor(
    private readonly gateway: TelegramGateway,
    private readonly updates: TelegramUpdatesRepository,
    private readonly dispatcher: TelegramDispatcher,
    private readonly clock: Clock,
  ) {}

  /** Procesa una actualización una sola vez por `update_id`; las repetidas o inválidas se ignoran. */
  async process(raw: unknown): Promise<void> {
    const update = this.gateway.parseUpdate(raw);
    if (!update) return;
    const isNew = await this.updates.insertIfNew(update.updateId, this.clock.now());
    if (!isNew) return;
    await this.dispatcher.dispatch(update);
  }
}
