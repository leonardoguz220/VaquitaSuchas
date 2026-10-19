import { type DynamicModule, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Clock } from '../clock/clock.js';
import { MailService } from '../ports/mail.service.js';
import { readMailSettings, type MailSettings } from './domain/mail-settings.js';
import { BrevoMailService, ResendMailService, type FetchFn } from './http-mail.service.js';
import { SmtpMailService } from './smtp-mail.service.js';

/** Elige la implementación de `MailService` según `MAIL_MODE` (y `MAIL_PROVIDER` en `prod`). */
export function createMailService(
  settings: MailSettings,
  clock: Clock,
  fetchFn: FetchFn = fetch,
): MailService {
  if (settings.mode === 'dev') {
    return new SmtpMailService(
      { host: settings.host, port: settings.port, from: settings.from },
      clock,
    );
  }
  const options = { apiKey: settings.apiKey, from: settings.from };
  return settings.provider === 'brevo'
    ? new BrevoMailService(options, fetchFn)
    : new ResendMailService(options, fetchFn);
}

/**
 * Registra el puerto `MailService` (RF-000-12). Global para que cualquier servicio lo inyecte sin
 * importar este módulo ni conocer la implementación concreta. Con `MAIL_MODE=dev` el correo va
 * por SMTP a la bandeja local; con `prod`, por la API HTTPS del proveedor.
 */
@Module({})
export class MailModule {
  static forRoot(): DynamicModule {
    return {
      module: MailModule,
      global: true,
      providers: [
        {
          provide: MailService,
          inject: [ConfigService, Clock],
          useFactory: (config: ConfigService, clock: Clock): MailService =>
            createMailService(
              readMailSettings((name) => config.get<string>(name)),
              clock,
            ),
        },
      ],
      exports: [MailService],
    };
  }
}
