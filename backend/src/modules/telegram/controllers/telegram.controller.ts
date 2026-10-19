import { Body, Controller, Get, HttpCode, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiExcludeController,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { TelegramDevService } from '../services/telegram-dev.service.js';
import { TelegramWebhookService } from '../services/telegram-webhook.service.js';
import { OutboxQueryDto, SimulateTelegramDto } from './telegram-dev.dto.js';
import { TelegramDevGuard } from './telegram-dev.guard.js';
import { TelegramWebhookSecretGuard } from './telegram-webhook-secret.guard.js';

@ApiTags('telegram')
@Controller('telegram')
export class TelegramController {
  constructor(private readonly webhook: TelegramWebhookService) {}

  @UseGuards(TelegramWebhookSecretGuard)
  @HttpCode(200)
  @Post('webhook')
  @ApiOperation({ summary: 'Webhook del bot de Telegram (RF-000-22)' })
  @ApiUnauthorizedResponse({ description: 'UNAUTHENTICATED: secreto ausente o incorrecto.' })
  async receive(@Body() update: unknown): Promise<{ ok: true }> {
    await this.webhook.process(update);
    return { ok: true };
  }
}

/** Solo `TELEGRAM_MODE=dev` (CA-000-17); fuera de ese modo responde 404 y no sale en Swagger. */
@ApiExcludeController()
@UseGuards(TelegramDevGuard)
@Controller('dev/telegram')
export class TelegramDevController {
  constructor(private readonly dev: TelegramDevService) {}

  @HttpCode(200)
  @Post('simulate')
  async simulate(@Body() body: SimulateTelegramDto): Promise<{ ok: true; updateId: number }> {
    return { ok: true, updateId: await this.dev.simulate(body) };
  }

  @Get('outbox')
  outbox(@Query() query: OutboxQueryDto): { messages: ReturnType<TelegramDevService['outbox']> } {
    return { messages: this.dev.outbox(query.telegramUserId) };
  }
}
