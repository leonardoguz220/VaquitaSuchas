import { Catch } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter, LoggerService } from '@nestjs/common';
import type { Request, Response } from 'express';
import { mapException } from './map-exception.js';

/**
 * Filtro global de excepciones (RF-000-11, CA-000-08). Toda respuesta de error sale con el
 * formato de `contracts/api.md` A.2; el detalle interno (mensaje, traza, SQL) va solo al log.
 *
 * Qué se registra: método, ruta SIN query, estado, código y, para los errores del servidor, la
 * traza. Nunca cabeceras, query, cuerpo ni parámetros: pueden llevar tokens, contraseñas o
 * cédulas. (La traza lleva el mensaje del `Error`, que en teoría puede contener datos; la
 * redacción de `pino`, RF-000-13, es la segunda barrera.)
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: LoggerService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { body, stack, logDetail } = mapException(exception);
    const isServerError = body.statusCode >= 500;

    const http = host.getType() === 'http' ? host.switchToHttp() : undefined;
    const request = http?.getRequest<Request>();

    const where = request ? `${request.method} ${pathWithoutQuery(request)}` : 'fuera de HTTP';
    const notAnError =
      exception instanceof Error ? '' : ` [valor lanzado de tipo ${typeof exception}]`;
    const message = `${where} -> ${body.statusCode} ${body.code}${notAnError}${
      logDetail ? ` (${logDetail})` : ''
    }`;

    if (isServerError) {
      if (stack) this.logger.error(message, stack);
      else this.logger.error(message);
    } else {
      this.logger.debug?.(message);
    }

    if (!http) return;

    const response = http.getResponse<Response>();
    if (response.headersSent) {
      // Ya se envió parte de la respuesta: no se puede escribir otro cuerpo, solo cerrar.
      response.end();
      return;
    }
    response.status(body.statusCode).json(body);
  }
}

function pathWithoutQuery(request: Request): string {
  const url = request.originalUrl ?? request.url ?? '';
  const queryStart = url.indexOf('?');
  return queryStart === -1 ? url : url.slice(0, queryStart);
}
