import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Pool } from 'pg';
import request from 'supertest';
import { PG_POOL } from '../src/shared/db/pg-pool.js';
import { configureApp } from '../src/shared/http/configure-app.js';

// Prueba de Swagger, helmet y CORS (RF-000-10, CA-000-07) sobre el AppModule real y la MISMA
// función `configureApp` que usa main.ts. No necesita PostgreSQL: el pool apunta a un puerto
// cerrado y solo /health lo toca (responde 200 «degraded»).

// Valores ficticios, sin archivo .env (RF-000-08).
const TEST_ENV: Record<string, string> = {
  NODE_ENV: 'test',
  PORT: '3001',
  DATABASE_URL: 'postgres://swagger_user:swagger_pw@127.0.0.1:1/swagger_db',
  JWT_SECRET: 'jwt-secret-sentinel-'.padEnd(32, 'j'),
  FINGERPRINT_KEY: 'fingerprint-sentinel-key',
  CI_ENCRYPTION_KEY: 'ab'.repeat(32),
  JOBS_TOKEN: 'jobs-token-sentinel-'.padEnd(32, 'c'),
  MAIL_MODE: 'dev',
  TELEGRAM_MODE: 'dev',
  STORAGE_DRIVER: 'local',
};

const FRONTEND_ORIGIN = 'https://vaquita.example';
const EVIL_ORIGIN = 'https://evil.example';
const VERSION = '0.1.0';

interface BootOptions {
  readonly nodeEnv: string;
  readonly frontendOrigin?: string;
}

async function bootstrap(options: BootOptions): Promise<INestApplication> {
  Object.assign(process.env, TEST_ENV);
  // ConfigModule.forRoot lee el entorno al evaluar app.module.ts: se importa ya con el entorno listo.
  const { AppModule } = await import('../src/app.module.js');
  const pool = new Pool({ connectionString: TEST_ENV.DATABASE_URL });
  pool.on('error', () => undefined);
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PG_POOL)
    .useValue(pool)
    .compile();
  const app = moduleRef.createNestApplication();
  configureApp(app, { ...options, version: VERSION });
  await app.init();
  return app;
}

describe('Swagger con NODE_ENV=test', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await bootstrap({ nodeEnv: 'test' });
  }, 30_000);

  afterAll(async () => {
    await app?.close();
  }, 15_000);

  it('CA-000-07 y RF-000-10: GET /api/docs responde 200 con la página de Swagger UI', async () => {
    const res = await request(app.getHttpServer()).get('/api/docs');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text).toContain('swagger-ui');
    expect(res.text).toContain('<title>Vaquita API</title>');
  });

  it('CA-000-07: los archivos de Swagger UI también se sirven (la página no queda en blanco)', async () => {
    const init = await request(app.getHttpServer()).get('/api/docs/swagger-ui-init.js');
    const bundle = await request(app.getHttpServer()).get('/api/docs/swagger-ui-bundle.js');
    const css = await request(app.getHttpServer()).get('/api/docs/swagger-ui.css');

    expect(init.status).toBe(200);
    expect(init.headers['content-type']).toMatch(/javascript/);
    expect(bundle.status).toBe(200);
    expect(css.status).toBe(200);
  });

  it('CA-000-07 y RF-000-10: /api/docs-json es un OpenAPI válido con /health y /internal/jobs/tick', async () => {
    const res = await request(app.getHttpServer()).get('/api/docs-json');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    const doc = JSON.parse(res.text) as {
      openapi: string;
      info: { title: string; description: string; version: string };
      paths: Record<string, Record<string, { tags?: string[] }>>;
      components?: { securitySchemes?: Record<string, { type: string; scheme?: string }> };
      servers?: unknown;
    };
    expect(doc.openapi).toMatch(/^3\.\d+\.\d+$/);
    expect(doc.info.title).toBe('Vaquita API');
    expect(doc.info.version).toBe(VERSION);
    expect(doc.info.description).toMatch(/Vaquita/);
    expect(doc.paths['/health']?.get?.tags).toContain('health');
    expect(doc.paths['/internal/jobs/tick']?.post?.tags).toContain('internal');
    expect(doc.components?.securitySchemes?.bearer).toMatchObject({
      type: 'http',
      scheme: 'bearer',
    });
    expect(doc.servers ?? []).toEqual([]);
  });

  it('CA-000-07 y RF-000-10: la documentación no expone secretos, valores de entorno ni URLs internas', async () => {
    const pages = ['/api/docs', '/api/docs-json', '/api/docs/swagger-ui-init.js'];

    for (const path of pages) {
      const res = await request(app.getHttpServer()).get(path);
      const text = res.text;

      for (const secret of [
        TEST_ENV.JWT_SECRET,
        TEST_ENV.JOBS_TOKEN,
        TEST_ENV.FINGERPRINT_KEY,
        TEST_ENV.CI_ENCRYPTION_KEY,
        TEST_ENV.DATABASE_URL,
        'swagger_pw',
        'swagger_user',
      ]) {
        expect(text).not.toContain(secret);
      }
      expect(text).not.toMatch(/postgres(ql)?:\/\//i);
      expect(text).not.toMatch(/127\.0\.0\.1|localhost/);
    }
  });

  it('RF-000-10: la CSP de la UI no admite scripts en línea y no fuerza https (rompe Swagger en http)', async () => {
    const res = await request(app.getHttpServer()).get('/api/docs');
    const csp = String(res.headers['content-security-policy']);

    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).not.toContain('unsafe-eval');
    expect(csp).not.toContain('upgrade-insecure-requests');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('RF-000-10: /api/docs lleva X-Request-Id', async () => {
    const res = await request(app.getHttpServer()).get('/api/docs');

    expect(res.headers['x-request-id']).toMatch(/^[A-Za-z0-9._-]{1,64}$/);
  });
});

describe('Swagger con NODE_ENV=production', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await bootstrap({ nodeEnv: 'production' });
  }, 30_000);

  afterAll(async () => {
    await app?.close();
  }, 15_000);

  it.each([
    ['/api/docs'],
    ['/api/docs/'],
    ['/api/docs-json'],
    ['/api/docs-yaml'],
    ['/api/docs/swagger-ui-init.js'],
    ['/api/docs/swagger-ui-bundle.js'],
  ])('CA-000-07 y RF-000-10: GET %s responde 404 en el formato de error uniforme', async (path) => {
    const res = await request(app.getHttpServer()).get(path);

    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(Object.keys(res.body).sort()).toEqual(['code', 'message', 'statusCode']);
    expect(res.body.statusCode).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
    expect(typeof res.body.message).toBe('string');
    expect(res.text).not.toMatch(/swagger/i);
    expect(res.text).not.toMatch(/stack|\bat \w+/);
  });

  it('CA-000-07: el 404 de producción también lleva X-Request-Id, y conserva el que envía el cliente', async () => {
    const generated = await request(app.getHttpServer()).get('/api/docs');
    const echoed = await request(app.getHttpServer())
      .get('/api/docs')
      .set('X-Request-Id', 'trace-abc.123');

    expect(generated.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(echoed.headers['x-request-id']).toBe('trace-abc.123');
  });

  it('RF-000-10: en producción /api/docs recibe la CSP estricta, sin relajar nada', async () => {
    const res = await request(app.getHttpServer()).get('/api/docs');
    const csp = String(res.headers['content-security-policy']);

    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain('upgrade-insecure-requests');
  });

  it('RF-000-10: los endpoints existentes siguen funcionando en producción', async () => {
    const health = await request(app.getHttpServer()).get('/health');
    const tick = await request(app.getHttpServer()).post('/internal/jobs/tick');

    expect(health.status).toBe(200);
    expect(tick.status).toBe(401);
    expect(tick.body.code).toBe('UNAUTHENTICATED');
  });
});

describe('Cabeceras de helmet (RF-000-10)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await bootstrap({ nodeEnv: 'test' });
  }, 30_000);

  afterAll(async () => {
    await app?.close();
  }, 15_000);

  it('RF-000-10: /health lleva las cabeceras de seguridad y no revela Express', async () => {
    const res = await request(app.getHttpServer()).get('/health');

    expect(res.status).toBe(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['strict-transport-security']).toMatch(/max-age=\d+/);
    expect(res.headers['x-frame-options']).toBeDefined();
    expect(res.headers['cross-origin-resource-policy']).toBe('same-origin');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('RF-000-10: /health lleva la CSP estricta de helmet (sin las relajaciones de Swagger)', async () => {
    const res = await request(app.getHttpServer()).get('/health');
    const csp = String(res.headers['content-security-policy']);

    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain('upgrade-insecure-requests');
    expect(csp).not.toContain('unsafe-eval');
  });

  it('RF-000-10: también un 404 y una respuesta de error llevan helmet y X-Request-Id', async () => {
    const notFound = await request(app.getHttpServer()).get('/no-existe');
    const unauthorized = await request(app.getHttpServer()).post('/internal/jobs/tick');

    for (const res of [notFound, unauthorized]) {
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-powered-by']).toBeUndefined();
      expect(res.headers['x-request-id']).toBeDefined();
    }
  });

  it('RF-000-10: un cuerpo JSON mal formado (error temprano del lector) también lleva helmet y X-Request-Id', async () => {
    const res = await request(app.getHttpServer())
      .post('/internal/jobs/tick')
      .set('Content-Type', 'application/json')
      .send('{"mal":');

    expect(res.status).toBe(400);
    expect(res.headers['x-request-id']).toBeDefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});

describe('CORS cerrado sin FRONTEND_ORIGIN (RF-000-10)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await bootstrap({ nodeEnv: 'test' });
  }, 30_000);

  afterAll(async () => {
    await app?.close();
  }, 15_000);

  it.each([[EVIL_ORIGIN], [FRONTEND_ORIGIN], ['null']])(
    'RF-000-10: una petición con Origin %s no recibe cabeceras de CORS',
    async (origin) => {
      const res = await request(app.getHttpServer()).get('/health').set('Origin', origin);

      expect(res.status).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
      expect(res.headers['access-control-allow-credentials']).toBeUndefined();
      expect(res.headers['access-control-expose-headers']).toBeUndefined();
    },
  );

  it('RF-000-10: un preflight OPTIONS no recibe permiso de CORS', async () => {
    const res = await request(app.getHttpServer())
      .options('/internal/jobs/tick')
      .set('Origin', EVIL_ORIGIN)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'x-jobs-token');

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    expect(res.headers['access-control-allow-methods']).toBeUndefined();
    expect(res.headers['access-control-allow-headers']).toBeUndefined();
  });
});

describe('CORS con FRONTEND_ORIGIN (RF-000-10)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await bootstrap({ nodeEnv: 'production', frontendOrigin: FRONTEND_ORIGIN });
  }, 30_000);

  afterAll(async () => {
    await app?.close();
  }, 15_000);

  it('RF-000-10: ese origen exacto recibe Access-Control-Allow-Origin, sin credenciales ni comodín', async () => {
    const res = await request(app.getHttpServer()).get('/health').set('Origin', FRONTEND_ORIGIN);

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe(FRONTEND_ORIGIN);
    expect(res.headers['access-control-allow-credentials']).toBeUndefined();
    expect(res.headers['vary']).toMatch(/Origin/i);
    const exposed = String(res.headers['access-control-expose-headers']);
    expect(exposed).toContain('X-Request-Id');
    expect(exposed).toContain('X-Session-Token');
  });

  it.each([
    [EVIL_ORIGIN],
    ['http://vaquita.example'],
    ['https://vaquita.example:8443'],
    ['https://vaquita.example.evil.example'],
    ['null'],
  ])('RF-000-10: el origen %s no recibe Access-Control-Allow-Origin', async (origin) => {
    const res = await request(app.getHttpServer()).get('/health').set('Origin', origin);

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('RF-000-10: sin cabecera Origin no hay cabeceras de CORS', async () => {
    const res = await request(app.getHttpServer()).get('/health');

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('RF-000-10: el preflight del origen permitido recibe 204 con métodos y cabeceras mínimos', async () => {
    const res = await request(app.getHttpServer())
      .options('/internal/jobs/tick')
      .set('Origin', FRONTEND_ORIGIN)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'authorization,content-type,x-request-id');

    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe(FRONTEND_ORIGIN);
    expect(res.headers['access-control-allow-credentials']).toBeUndefined();
    const methods = String(res.headers['access-control-allow-methods']).split(',');
    expect(methods).toEqual(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
    const headers = String(res.headers['access-control-allow-headers']).toLowerCase();
    expect(headers).toContain('authorization');
    expect(headers).toContain('content-type');
    expect(headers).toContain('x-request-id');
    expect(res.headers['x-request-id']).toBeDefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('RF-000-10: el preflight de otro origen no recibe Access-Control-Allow-Origin', async () => {
    const res = await request(app.getHttpServer())
      .options('/internal/jobs/tick')
      .set('Origin', EVIL_ORIGIN)
      .set('Access-Control-Request-Method', 'POST');

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('RF-000-10: nunca responde con Access-Control-Allow-Origin: * ', async () => {
    for (const origin of [FRONTEND_ORIGIN, EVIL_ORIGIN]) {
      const res = await request(app.getHttpServer()).get('/health').set('Origin', origin);

      expect(res.headers['access-control-allow-origin']).not.toBe('*');
    }
  });
});
