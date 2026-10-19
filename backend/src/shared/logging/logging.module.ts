import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import type { DestinationStream } from 'pino';
import { buildPinoHttpOptions } from './logging.config.js';
import type { LoggingOptions } from './logging.config.js';

export interface LoggingModuleOptions extends LoggingOptions {
  /** Solo para pruebas: dónde escribe `pino`. Por defecto, la salida estándar. */
  destination?: DestinationStream;
}

/**
 * Logs estructurados con `nestjs-pino` (RF-000-13): una línea JSON por evento, `reqId` por
 * petición y redacción de datos sensibles (ver `logging.config.ts`). `main.ts` debe llamar a
 * `app.useLogger(app.get(Logger))` con `bufferLogs: true`; así también el `Logger` de Nest
 * (filtro de errores, guards, servicios) sale por `pino` con el `reqId` de la petición en curso.
 *
 * `nestjs-pino` crea un único `pino` por proceso la primera vez que se usa: las opciones de la
 * primera llamada son las que valen.
 */
@Module({})
export class LoggingModule {
  static forRoot(options: LoggingModuleOptions = {}): DynamicModule {
    const { destination, ...loggingOptions } = options;
    const pinoHttp = buildPinoHttpOptions({
      nodeEnv: process.env['NODE_ENV'],
      ...loggingOptions,
    });
    return {
      module: LoggingModule,
      imports: [
        LoggerModule.forRoot({ pinoHttp: destination ? [pinoHttp, destination] : pinoHttp }),
      ],
    };
  }
}
