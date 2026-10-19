import { Injectable } from '@nestjs/common';
import { Clock } from '../../../shared/clock/clock.js';
import { DomainError } from '../../../shared/errors/domain-error.js';
import { ErrorCode } from '../../../shared/errors/error-codes.js';
import { buildSimulatedUpdate, type SimulatedUpdateInput } from '../domain/telegram-update.js';
import { TelegramGateway, type TelegramMessage } from '../ports/telegram.gateway.js';
import { DevTelegramGateway } from './dev-telegram.gateway.js';
import { TelegramWebhookService } from './telegram-webhook.service.js';

@Injectable()
export class TelegramDevService {
  private lastUpdateId = 0;

  constructor(
    private readonly gateway: TelegramGateway,
    private readonly webhook: TelegramWebhookService,
    private readonly clock: Clock,
  ) {}

  /** Procesa un `Update` simulado como si llegara por el webhook (sin el secreto). */
  async simulate(input: SimulatedUpdateInput): Promise<number> {
    this.lastUpdateId = Math.max(this.lastUpdateId + 1, this.clock.now().getTime());
    await this.webhook.process(buildSimulatedUpdate(input, this.lastUpdateId));
    return this.lastUpdateId;
  }

  outbox(telegramUserId: number): readonly TelegramMessage[] {
    if (!(this.gateway instanceof DevTelegramGateway)) {
      throw new DomainError(ErrorCode.NOT_FOUND, 404, 'No se encontró el recurso solicitado.');
    }
    return this.gateway.messagesFor(telegramUserId);
  }
}
