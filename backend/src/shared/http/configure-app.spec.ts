import { jest } from '@jest/globals';
import type { INestApplication } from '@nestjs/common';
import { SwaggerModule } from '@nestjs/swagger';
import { requestIdMiddleware } from '../logging/request-id.middleware.js';
import { configureApp } from './configure-app.js';

const ORIGIN = 'https://vaquita.example';

/**
 * Distingue helmet de cualquier otro middleware por lo que hace, no por descarte: lo ejecuta con una
 * respuesta falsa y comprueba que fija la CSP. Un middleware ajeno queda como 'unknown' y rompe el
 * orden esperado.
 */
function classify(middleware: unknown): string {
  if (middleware === requestIdMiddleware) return 'requestId';
  if (typeof middleware !== 'function') return 'unknown';

  const headers: string[] = [];
  const response = {
    setHeader: (name: string) => headers.push(name.toLowerCase()),
    removeHeader: () => undefined,
    getHeader: () => undefined,
  };
  try {
    (middleware as (req: unknown, res: unknown, next: () => void) => void)(
      { url: '/', headers: {} },
      response,
      () => undefined,
    );
  } catch {
    return 'unknown';
  }
  return headers.includes('content-security-policy') ? 'helmet' : 'unknown';
}

/** App falsa que anota en qué orden se registra cada pieza; no arranca Nest ni abre puertos. */
function fakeApp(calls: string[]): INestApplication {
  const app = {
    use: jest.fn((middleware: unknown) => {
      calls.push(classify(middleware));
    }),
    enableCors: jest.fn(() => {
      calls.push('cors');
    }),
  };
  return app as unknown as INestApplication;
}

describe('configureApp (RF-000-10, CA-000-07)', () => {
  let calls: string[];
  let setup: jest.SpiedFunction<typeof SwaggerModule.setup>;

  beforeEach(() => {
    calls = [];
    jest
      .spyOn(SwaggerModule, 'createDocument')
      .mockReturnValue({ openapi: '3.0.0', info: { title: '', version: '' }, paths: {} });
    setup = jest.spyOn(SwaggerModule, 'setup').mockImplementation(() => {
      calls.push('swagger');
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Swagger solo en development y test', () => {
    it.each([['development'], ['test']])(
      'CA-000-07 y RF-000-10: con NODE_ENV=%s monta Swagger en api/docs',
      (nodeEnv) => {
        configureApp(fakeApp(calls), { nodeEnv, version: '0.1.0' });

        expect(setup).toHaveBeenCalledTimes(1);
        expect(setup.mock.calls[0]?.[0]).toBe('api/docs');
      },
    );

    it.each([
      ['production'],
      ['staging'],
      ['Test'],
      ['DEVELOPMENT'],
      [' test'],
      ['development;production'],
      [''],
      [undefined],
    ])('CA-000-07 y RF-000-10: con NODE_ENV=%j NO monta Swagger', (nodeEnv) => {
      configureApp(fakeApp(calls), { nodeEnv, version: '0.1.0' });

      expect(setup).not.toHaveBeenCalled();
      expect(SwaggerModule.createDocument).not.toHaveBeenCalled();
    });
  });

  describe('orden de los middlewares', () => {
    it('RF-000-10: requestId, luego helmet, luego CORS y por último Swagger', () => {
      configureApp(fakeApp(calls), { nodeEnv: 'test', frontendOrigin: ORIGIN, version: '0.1.0' });

      expect(calls).toEqual(['requestId', 'helmet', 'cors', 'swagger']);
    });

    it('RF-000-10: en producción sin origen solo quedan requestId y helmet, en ese orden', () => {
      configureApp(fakeApp(calls), { nodeEnv: 'production', version: '0.1.0' });

      expect(calls).toEqual(['requestId', 'helmet']);
    });

    it('RF-000-10: el clasificador distingue helmet de otro middleware (el orden fallaría con uno ajeno)', () => {
      const other = (_req: unknown, _res: unknown, next: () => void): void => next();

      expect(classify(other)).toBe('unknown');
      expect(classify(requestIdMiddleware)).toBe('requestId');
      expect(classify('no es una función')).toBe('unknown');
    });
  });

  describe('CORS cerrado al origen del frontend', () => {
    it('RF-000-10: sin FRONTEND_ORIGIN no registra CORS', () => {
      const app = fakeApp(calls);

      configureApp(app, { nodeEnv: 'test', version: '0.1.0' });
      configureApp(fakeApp(calls), { nodeEnv: 'test', frontendOrigin: '', version: '0.1.0' });

      expect(app.enableCors).not.toHaveBeenCalled();
      expect(calls).not.toContain('cors');
    });

    it('RF-000-10: con FRONTEND_ORIGIN registra CORS una vez y solo para ese origen', () => {
      const app = fakeApp(calls);

      configureApp(app, { nodeEnv: 'test', frontendOrigin: ORIGIN, version: '0.1.0' });

      const enableCors = app.enableCors as unknown as jest.Mock<(options: unknown) => void>;
      expect(enableCors).toHaveBeenCalledTimes(1);
      const options = enableCors.mock.calls[0]?.[0] as { origin: unknown; credentials?: boolean };
      expect(typeof options.origin).toBe('function');
      expect(options.origin).not.toBe('*');
      expect(options.origin).not.toBe(true);
      expect(options.credentials).toBeUndefined();
    });

    it('RF-000-10: un FRONTEND_ORIGIN inválido hace fallar el arranque, no abre CORS', () => {
      const app = fakeApp(calls);

      expect(() =>
        configureApp(app, { nodeEnv: 'test', frontendOrigin: '*', version: '0.1.0' }),
      ).toThrow(/FRONTEND_ORIGIN/);
      expect(app.enableCors).not.toHaveBeenCalled();
    });
  });

  it('RF-000-10: Swagger usa la versión recibida', () => {
    const createDocument = jest.spyOn(SwaggerModule, 'createDocument');

    configureApp(fakeApp(calls), { nodeEnv: 'test', version: '9.8.7' });

    const config = createDocument.mock.calls[0]?.[1];
    expect(config?.info.version).toBe('9.8.7');
  });
});
