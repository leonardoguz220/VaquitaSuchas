import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface.js';
import { normalizeFrontendOrigin } from './frontend-origin.js';

// CORS cerrado (RF-000-10). El navegador no llama al backend: lo hace el proxy /api de Next.js
// desde el servidor, y ese tráfico no usa CORS. Por eso, sin `FRONTEND_ORIGIN`, no se registra
// CORS y ninguna respuesta lleva cabeceras `Access-Control-*`.

// Mínimo que usa el contrato (`contracts/api.md` A.1): sesión por `Authorization`, cuerpos JSON y
// multipart (`Content-Type`) y trazabilidad por `X-Request-Id`.
const ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const ALLOWED_HEADERS = ['Authorization', 'Content-Type', 'X-Request-Id'];
// El frontend lee el id de la petición y el token de sesión renovado (renovación deslizante).
const EXPOSED_HEADERS = ['X-Request-Id', 'X-Session-Token'];
const PREFLIGHT_MAX_AGE_SECONDS = 600;

/**
 * Opciones de CORS para el único origen permitido, o `undefined` si no hay ninguno (CORS cerrado).
 * Nunca `origin: '*'` ni `true`, y nunca `credentials`: la sesión viaja por el proxy, no por el navegador.
 */
export function buildCorsOptions(frontendOrigin: string | undefined): CorsOptions | undefined {
  const allowedOrigin = normalizeFrontendOrigin(frontendOrigin);
  if (allowedOrigin === undefined) return undefined;

  return {
    // Comparación exacta y sensible a mayúsculas: el navegador envía el origen ya normalizado.
    origin: (requestOrigin, callback) => callback(null, requestOrigin === allowedOrigin),
    methods: ALLOWED_METHODS,
    allowedHeaders: ALLOWED_HEADERS,
    exposedHeaders: EXPOSED_HEADERS,
    maxAge: PREFLIGHT_MAX_AGE_SECONDS,
  };
}
