import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthModule } from './modules/health/health.module.js';
import { ClockModule } from './shared/clock/clock.module.js';
import { validateEnv } from './shared/config/env.validation.js';
import { DbModule } from './shared/db/db.module.js';
import { ErrorsModule } from './shared/errors/errors.module.js';
import { EventsModule } from './shared/events/events.module.js';

@Module({
  imports: [
    // Si falta o es inválida alguna variable, el arranque falla nombrándolas todas (RF-000-08).
    ConfigModule.forRoot({ validate: validateEnv, isGlobal: true }),
    ClockModule,
    DbModule,
    EventsModule,
    // Filtro global de errores y ValidationPipe (RF-000-11).
    ErrorsModule,
    HealthModule,
  ],
})
export class AppModule {}
