import { Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { DomainError } from '../../../shared/errors/domain-error.js';
import { ErrorCode } from '../../../shared/errors/error-codes.js';
import { constantTimeEquals } from '../../../shared/guards/constant-time.js';

export const TELEGRAM_SECRET_HEADER = 'x-telegram-bot-api-secret-token';

/** Exige `X-Telegram-Bot-Api-Secret-Token` igual a `TELEGRAM_WEBHOOK_SECRET` (tiempo constante). */
@Injectable()
export class TelegramWebhookSecretGuard implements CanActivate {
  private readonly expected: string | undefined;

  constructor(config: ConfigService) {
    this.expected = config.get<string>('TELEGRAM_WEBHOOK_SECRET')?.trim() || undefined;
  }

  canActivate(context: ExecutionContext): boolean {
    const received = context.switchToHttp().getRequest<Request>().headers?.[TELEGRAM_SECRET_HEADER];
    if (
      this.expected === undefined ||
      typeof received !== 'string' ||
      !constantTimeEquals(received, this.expected)
    ) {
      throw new DomainError(ErrorCode.UNAUTHENTICATED, 401, 'Credencial de servicio inválida.');
    }
    return true;
  }
}
