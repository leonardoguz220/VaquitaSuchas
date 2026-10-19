import type { IncomingMessage, ServerResponse } from 'node:http';
import helmet from 'helmet';

// Cabeceras de seguridad (RF-000-10). Valores por defecto de helmet, que ya son los seguros para una
// API JSON: CSP estricta, HSTS, nosniff, sin X-Powered-By, etc.

type Next = (error?: unknown) => void;
export type SecurityHeadersMiddleware = (
  request: IncomingMessage,
  response: ServerResponse,
  next: Next,
) => void;

export const DOCS_PATH = '/api/docs';

/** `true` para `/api/docs` y lo que cuelga de él (Swagger UI y sus archivos). No incluye `/api/docs-json`. */
export function isDocsPath(url: string): boolean {
  // Express enruta sin distinguir mayúsculas: se compara igual para no dejar la UI con otra CSP.
  const path = (url.split('?')[0] ?? '').toLowerCase();
  return path === DOCS_PATH || path.startsWith(`${DOCS_PATH}/`);
}

/**
 * Swagger UI carga todos sus scripts como archivos propios (`script-src 'self'` basta) y sus estilos
 * en línea ya los permite helmet. Lo único que se relaja es `upgrade-insecure-requests`: en desarrollo
 * la UI se sirve por http (sin TLS) y algunos navegadores (Safari) piden entonces sus archivos por
 * https y la página queda en blanco. No se agrega `unsafe-inline` ni `unsafe-eval`.
 */
function buildDocsHelmet(): SecurityHeadersMiddleware {
  return helmet({
    contentSecurityPolicy: { directives: { 'upgrade-insecure-requests': null } },
  });
}

/**
 * Un único middleware de helmet que elige la CSP por ruta. La CSP relajada solo existe si Swagger
 * está montado: en producción cualquier ruta, `/api/docs` incluida, recibe la CSP estricta.
 */
export function buildSecurityHeaders(options: {
  readonly swaggerEnabled: boolean;
}): SecurityHeadersMiddleware {
  const strict = helmet();
  const docs = options.swaggerEnabled ? buildDocsHelmet() : undefined;

  return (request, response, next) => {
    const useDocs = docs !== undefined && isDocsPath(request.url ?? '');
    (useDocs ? docs : strict)(request, response, next);
  };
}
