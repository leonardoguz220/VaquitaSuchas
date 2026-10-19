import type { IncomingMessage, ServerResponse } from 'node:http';
import { REQUEST_ID_HEADER, resolveRequestId } from './logging.config.js';

/**
 * Asigna el identificador de la petición y lo devuelve en la cabecera de la respuesta.
 *
 * `main.ts` lo instala con `app.use(...)` ANTES de `listen`, para que corra antes del lector de
 * cuerpos: si el JSON viene mal formado (400) o excede el tamaño (413) el error nace en ese lector,
 * antes de cualquier middleware de módulo, y la respuesta igual debe llevar `X-Request-Id`.
 * `pino-http` reutiliza el `req.id` ya asignado; sin este middleware lo asigna él mismo con las
 * mismas reglas (ver `buildPinoHttpOptions`), salvo en esos errores tempranos.
 */
export function requestIdMiddleware(
  request: IncomingMessage,
  response: ServerResponse,
  next: () => void,
): void {
  const requestId = resolveRequestId(request.headers['x-request-id']);
  request.id = requestId;
  response.setHeader(REQUEST_ID_HEADER, requestId);
  next();
}
