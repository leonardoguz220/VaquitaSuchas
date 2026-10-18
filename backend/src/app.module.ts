import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ClockModule } from './shared/clock/clock.module.js';
import { validateEnv } from './shared/config/env.validation.js';
import { DbModule } from './shared/db/db.module.js';

@Module({
  imports: [
    // Si falta o es inválida alguna variable, el arranque falla nombrándolas todas (RF-000-08).
    ConfigModule.forRoot({ validate: validateEnv, isGlobal: true }),
    ClockModule,
    DbModule,
  ],
})
export class AppModule {}
