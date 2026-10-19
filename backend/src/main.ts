import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { Logger as PinoLogger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { APP_VERSION } from './modules/health/domain/health.js';
import { configureApp } from './shared/http/configure-app.js';

const DEFAULT_PORT = 3001;

async function bootstrap(): Promise<void> {
  // `bufferLogs` retiene los logs de arranque hasta fijar el logger: así también salen en JSON.
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(PinoLogger));
  // Antes de `listen`: X-Request-Id, helmet, CORS y Swagger quedan delante del lector de cuerpos.
  const config = app.get(ConfigService);
  configureApp(app, {
    nodeEnv: config.get<string>('NODE_ENV'),
    frontendOrigin: config.get<string>('FRONTEND_ORIGIN'),
    version: APP_VERSION,
  });
  const port = Number(process.env.PORT) || DEFAULT_PORT;
  await app.listen(port);
  new Logger('Bootstrap').log(`Backend escuchando en el puerto ${port}`);
}

void bootstrap();
