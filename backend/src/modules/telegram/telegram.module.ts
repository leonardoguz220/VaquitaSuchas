import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TelegramDevController, TelegramController } from './controllers/telegram.controller.js';
import { TelegramGateway } from './ports/telegram.gateway.js';
import { HttpTelegramGateway } from './repositories/http-telegram.gateway.js';
import { TelegramUpdatesRepository } from './repositories/telegram-updates.repository.js';
import { DevTelegramGateway } from './services/dev-telegram.gateway.js';
import { TelegramDevService } from './services/telegram-dev.service.js';
import { TelegramDispatcher } from './services/telegram-dispatcher.js';
import { TelegramWebhookService } from './services/telegram-webhook.service.js';

// DbService, Clock y ConfigService llegan de módulos globales. Con TELEGRAM_MODE=dev el bot es un
// simulador en memoria; con prod, HTTPS a api.telegram.org (validateEnv exige el token).
@Module({
  controllers: [TelegramController, TelegramDevController],
  providers: [
    {
      provide: TelegramGateway,
      inject: [ConfigService],
      useFactory: (config: ConfigService): TelegramGateway =>
        config.get<string>('TELEGRAM_MODE') === 'prod'
          ? new HttpTelegramGateway(config.getOrThrow<string>('TELEGRAM_BOT_TOKEN'))
          : new DevTelegramGateway(),
    },
    TelegramUpdatesRepository,
    TelegramDispatcher,
    TelegramWebhookService,
    TelegramDevService,
  ],
  exports: [TelegramGateway, TelegramDispatcher],
})
export class TelegramModule {}
