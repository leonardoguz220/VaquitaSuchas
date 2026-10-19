import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface.js';
import { buildCorsOptions } from './cors.config.js';

const ORIGIN = 'https://vaquita.example';

/** Evalúa la función `origin` de las opciones como lo hace el paquete `cors`. */
function decide(options: CorsOptions, requestOrigin: string | undefined): unknown {
  const { origin } = options;
  if (typeof origin !== 'function') throw new Error('origin debía ser una función');
  let decision: unknown = 'sin respuesta';
  origin(requestOrigin, (_error, allowed) => {
    decision = allowed;
  });
  return decision;
}

describe('buildCorsOptions (RF-000-10)', () => {
  it('RF-000-10: sin FRONTEND_ORIGIN no hay opciones: CORS queda cerrado del todo', () => {
    expect(buildCorsOptions(undefined)).toBeUndefined();
  });

  it('RF-000-10: con FRONTEND_ORIGIN solo permite ese origen exacto', () => {
    const options = buildCorsOptions(ORIGIN);
    expect(options).toBeDefined();

    expect(decide(options as CorsOptions, ORIGIN)).toBe(true);
    for (const other of [
      'https://evil.example',
      'http://vaquita.example',
      'https://vaquita.example:8443',
      'https://sub.vaquita.example',
      'https://vaquita.example.evil.example',
      'https://VAQUITA.example',
      'null',
      '*',
      '',
    ]) {
      expect(decide(options as CorsOptions, other)).toBe(false);
    }
  });

  it('RF-000-10: una petición sin Origin (servidor a servidor) no recibe permiso CORS', () => {
    expect(decide(buildCorsOptions(ORIGIN) as CorsOptions, undefined)).toBe(false);
  });

  it('RF-000-10: nunca abre a todos ni usa credenciales', () => {
    const options = buildCorsOptions(ORIGIN) as CorsOptions;

    expect(options.origin).not.toBe('*');
    expect(options.origin).not.toBe(true);
    expect(options.credentials).toBeUndefined();
  });

  it('RF-000-10: métodos y cabeceras mínimos, y expone X-Request-Id y X-Session-Token', () => {
    const options = buildCorsOptions(ORIGIN) as CorsOptions;

    expect(options.methods).toEqual(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
    expect(options.allowedHeaders).toEqual(['Authorization', 'Content-Type', 'X-Request-Id']);
    expect(options.exposedHeaders).toEqual(['X-Request-Id', 'X-Session-Token']);
  });

  it('RF-000-10: un FRONTEND_ORIGIN inválido hace fallar en vez de abrir CORS', () => {
    expect(() => buildCorsOptions('*')).toThrow(/FRONTEND_ORIGIN/);
    expect(() => buildCorsOptions('https://vaquita.example/')).toThrow(/FRONTEND_ORIGIN/);
  });

  it('RF-000-10: un FRONTEND_ORIGIN en blanco cuenta como ausente', () => {
    expect(buildCorsOptions('  ')).toBeUndefined();
  });
});
