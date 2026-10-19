import { resolveHttpOptions } from './resolve-http-options.js';

/** Doble de `ConfigService`: devuelve solo las claves que se le dan, igual que un entorno real. */
function configWith(values: Record<string, string | undefined>) {
  const asked: string[] = [];
  return {
    asked,
    get<T>(key: string): T | undefined {
      asked.push(key);
      return values[key] as T | undefined;
    },
  };
}

describe('resolveHttpOptions (RF-000-10, CA-000-07)', () => {
  it.each([['production'], ['development'], ['test']])(
    'CA-000-07 y RF-000-10: NODE_ENV=%s llega tal cual a nodeEnv',
    (nodeEnv) => {
      const options = resolveHttpOptions(configWith({ NODE_ENV: nodeEnv }), '0.1.0');

      expect(options.nodeEnv).toBe(nodeEnv);
    },
  );

  it('CA-000-07: sin NODE_ENV no inventa un valor por defecto que active Swagger', () => {
    const options = resolveHttpOptions(configWith({}), '0.1.0');

    expect(options.nodeEnv).toBeUndefined();
  });

  it('RF-000-10: FRONTEND_ORIGIN presente llega a frontendOrigin', () => {
    const options = resolveHttpOptions(
      configWith({ NODE_ENV: 'production', FRONTEND_ORIGIN: 'https://vaquita.example' }),
      '0.1.0',
    );

    expect(options.frontendOrigin).toBe('https://vaquita.example');
  });

  it('RF-000-10: FRONTEND_ORIGIN ausente deja frontendOrigin en undefined (CORS cerrado)', () => {
    const options = resolveHttpOptions(configWith({ NODE_ENV: 'production' }), '0.1.0');

    expect(options.frontendOrigin).toBeUndefined();
  });

  it('RF-000-10: la versión recibida se propaga sin cambios', () => {
    const options = resolveHttpOptions(configWith({ NODE_ENV: 'test' }), '9.8.7');

    expect(options.version).toBe('9.8.7');
  });

  it('RF-000-10: lee exactamente las claves NODE_ENV y FRONTEND_ORIGIN', () => {
    const config = configWith({});

    resolveHttpOptions(config, '0.1.0');

    expect([...config.asked].sort()).toEqual(['FRONTEND_ORIGIN', 'NODE_ENV']);
  });
});
