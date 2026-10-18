import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './shared/config/env.validation.js';

@Module({
  // Si falta o es inválida alguna variable, el arranque falla nombrándolas todas (RF-000-08).
  imports: [ConfigModule.forRoot({ validate: validateEnv, isGlobal: true })],
})
export class AppModule {}
