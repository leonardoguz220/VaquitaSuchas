import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthModule } from './modules/health/health.module.js';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module.js';
import { TelegramModule } from './modules/telegram/telegram.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { ClockModule } from './shared/clock/clock.module.js';
import { validateEnv } from './shared/config/env.validation.js';
import { DbModule } from './shared/db/db.module.js';
import { ErrorsModule } from './shared/errors/errors.module.js';
import { EventsModule } from './shared/events/events.module.js';
import { JobsHttpModule } from './shared/jobs/jobs-http.module.js';
import { JobsModule } from './shared/jobs/jobs.module.js';
import { LoggingModule } from './shared/logging/logging.module.js';
import { MailModule } from './shared/mail/mail.module.js';
import { StorageModule } from './shared/storage/storage.module.js';

@Module({
  imports: [
    // Si falta o es inválida alguna variable, el arranque falla nombrándolas todas (RF-000-08).
    ConfigModule.forRoot({ validate: validateEnv, isGlobal: true }),
    // Logs JSON con reqId y redacción de datos sensibles (RF-000-13).
    LoggingModule.forRoot(),
    ClockModule,
    DbModule,
    EventsModule,
    // Puerto MailService: SMTP a Mailpit en `dev`, API HTTPS del proveedor en `prod` (RF-000-12).
    MailModule.forRoot(),
    // Puerto FileStorage: carpeta no pública en `local`, Supabase Storage en `supabase` (RF-000-12).
    StorageModule.forRoot(),
    // Tareas programadas: registro, runner y cron interno opcional (RF-000-14).
    JobsModule,
    // POST /internal/jobs/tick con X-Jobs-Token y límite de 1 llamada por segundo (RF-000-14).
    JobsHttpModule,
    // Filtro global de errores y ValidationPipe (RF-000-11).
    ErrorsModule,
    HealthModule,
    // Webhook del bot, deduplicación por update_id y simulador en modo dev (RF-000-22).
    TelegramModule,
    SubscriptionsModule,
    AuthModule,
    UsersModule,
  ],
})
export class AppModule {}
