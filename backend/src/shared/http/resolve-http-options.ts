import type { ConfigureAppOptions } from './configure-app.js';

/** Lo único que se necesita de `ConfigService`: así la lectura se prueba sin levantar Nest. */
export interface HttpConfigSource {
  get<T>(key: string): T | undefined;
}

/**
 * Traduce el entorno validado a las opciones de `configureApp` (RF-000-10). Vive aparte de
 * `main.ts` para que una clave mal escrita o un `nodeEnv` olvidado rompa una prueba. No aplica
 * valores por defecto: sin `NODE_ENV` Swagger queda apagado y sin `FRONTEND_ORIGIN` CORS, cerrado.
 */
export function resolveHttpOptions(config: HttpConfigSource, version: string): ConfigureAppOptions {
  return {
    nodeEnv: config.get<string>('NODE_ENV'),
    frontendOrigin: config.get<string>('FRONTEND_ORIGIN'),
    version,
  };
}
