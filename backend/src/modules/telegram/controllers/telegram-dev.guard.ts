import { Injectable } from '@nestjs/common';
import type { CanActivate } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DomainError } from '../../../shared/errors/domain-error.js';
import { ErrorCode } from '../../../shared/errors/error-codes.js';

/** Las rutas `/dev/telegram/*` solo existen con `TELEGRAM_MODE=dev`; en otro modo responden 404. */
@Injectable()
export class TelegramDevGuard implements CanActivate {
  private readonly enabled: boolean;

  constructor(config: ConfigService) {
    this.enabled = config.get<string>('TELEGRAM_MODE') === 'dev';
  }

  canActivate(): boolean {
    if (!this.enabled) {
      throw new DomainError(ErrorCode.NOT_FOUND, 404, 'No se encontró el recurso solicitado.');
    }
    return true;
  }
}
