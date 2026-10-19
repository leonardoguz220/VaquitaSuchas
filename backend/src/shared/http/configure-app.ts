import type { INestApplication } from '@nestjs/common';
import { requestIdMiddleware } from '../logging/request-id.middleware.js';
import { buildCorsOptions } from './cors.config.js';
import { buildSecurityHeaders } from './security-headers.js';
import { isSwaggerEnabled, setupSwagger } from './swagger.config.js';

export interface ConfigureAppOptions {
  /** Valor de `NODE_ENV`: decide si Swagger se monta (solo `development` y `test`). */
  readonly nodeEnv: string | undefined;
  /** Valor de `FRONTEND_ORIGIN`: único origen que CORS admite. Sin él, CORS queda cerrado. */
  readonly frontendOrigin?: string | undefined;
  /** Versión de la API que muestra Swagger (la misma que `/health`). */
  readonly version: string;
}

/**
 * Configuración HTTP común del backend (RF-000-10). La usan `main.ts` y las pruebas e2e, para que
 * lo probado sea exactamente lo que corre. Debe llamarse ANTES de `listen`/`init`, para que estos
 * middlewares queden delante del lector de cuerpos y de las rutas.
 *
 * El orden importa:
 * 1. `X-Request-Id`: primero, para que también salga en errores tempranos de las capas siguientes.
 * 2. `helmet`: las cabeceras de seguridad deben estar en toda respuesta, también en la de CORS.
 * 3. CORS: solo con `FRONTEND_ORIGIN`.
 * 4. Swagger: solo en `development` y `test`; sus rutas ya pasaron por los tres anteriores.
 */
export function configureApp(app: INestApplication, options: ConfigureAppOptions): void {
  const swaggerEnabled = isSwaggerEnabled(options.nodeEnv);

  app.use(requestIdMiddleware);
  app.use(buildSecurityHeaders({ swaggerEnabled }));

  const corsOptions = buildCorsOptions(options.frontendOrigin);
  if (corsOptions) app.enableCors(corsOptions);

  if (swaggerEnabled) setupSwagger(app, options.version);
}
