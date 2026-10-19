import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { DOCS_PATH } from './security-headers.js';

// Swagger solo en desarrollo y pruebas (RF-000-10, `contracts/api.md` B). Cualquier otro valor de
// NODE_ENV, producción incluida, deja la documentación sin montar: las rutas responden 404.
const SWAGGER_ENVIRONMENTS: readonly string[] = ['development', 'test'];

export function isSwaggerEnabled(nodeEnv: string | undefined): boolean {
  return nodeEnv !== undefined && SWAGGER_ENVIRONMENTS.includes(nodeEnv);
}

/**
 * Monta Swagger UI en `/api/docs` y el JSON en `/api/docs-json`. El documento se arma solo con los
 * decoradores de los controladores: no lleva valores de entorno, servidores ni URLs internas.
 */
export function setupSwagger(app: INestApplication, version: string): void {
  const config = new DocumentBuilder()
    .setTitle('Vaquita API')
    .setDescription(
      'API de Vaquita: suscripciones compartidas, cobros y pagos. Documentación solo para desarrollo y pruebas.',
    )
    .setVersion(version)
    .addBearerAuth()
    .addTag('health', 'Estado del servicio y de la base de datos')
    .addTag('internal', 'Endpoints internos (tareas programadas); no los usa el frontend')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  // El nombre de la ruta ya incluye `api/`: el backend no usa prefijo global (contrato A.1).
  SwaggerModule.setup(DOCS_PATH.slice(1), app, document, {
    customSiteTitle: 'Vaquita API',
  });
}
