import { ConfigService } from '@nestjs/config';
import { DomainError } from '../../../shared/errors/domain-error.js';
import { TelegramDevGuard } from './telegram-dev.guard.js';

const guardFor = (mode: string) => new TelegramDevGuard(new ConfigService({ TELEGRAM_MODE: mode }));

describe('TelegramDevGuard', () => {
  it('CA-000-17: con TELEGRAM_MODE=dev deja pasar', () => {
    expect(guardFor('dev').canActivate()).toBe(true);
  });

  it('CA-000-17: con TELEGRAM_MODE=prod responde 404 NOT_FOUND', () => {
    expect(() => guardFor('prod').canActivate()).toThrow(
      expect.objectContaining({ httpStatus: 404, code: 'NOT_FOUND' }) as DomainError,
    );
  });
});
