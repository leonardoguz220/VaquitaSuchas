import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Logger as PinoLogger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { requestIdMiddleware } from './shared/logging/request-id.middleware.js';

const DEFAULT_PORT = 3001;

async function bootstrap(): Promise<void> {
  // `bufferLogs` retiene los logs de arranque hasta fijar el logger: así también salen en JSON.
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(PinoLogger));
  // Antes de `listen`: corre antes del lector de cuerpos (ver request-id.middleware.ts).
  app.use(requestIdMiddleware);
  const port = Number(process.env.PORT) || DEFAULT_PORT;
  await app.listen(port);
  new Logger('Bootstrap').log(`Backend escuchando en el puerto ${port}`);
}

void bootstrap();
