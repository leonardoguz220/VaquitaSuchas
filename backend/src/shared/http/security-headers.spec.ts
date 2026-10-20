import type { IncomingMessage, ServerResponse } from 'node:http';
import request from 'supertest';
import { buildSecurityHeaders, isDocsPath } from './security-headers.js';

// Servidor HTTP mínimo: solo el middleware bajo prueba, sin Nest ni base de datos.
function handlerWith(swaggerEnabled: boolean): (req: IncomingMessage, res: ServerResponse) => void {
  const securityHeaders = buildSecurityHeaders({ swaggerEnabled });
  return (req, res) => {
    securityHeaders(req, res, () => {
      res.setHeader('Content-Type', 'text/plain');
      res.end('ok');
    });
  };
}

describe('isDocsPath (RF-000-10)', () => {
  it.each([
    ['/api/docs'],
    ['/api/docs/'],
    ['/api/docs?x=1'],
    ['/api/docs/swagger-ui-init.js'],
    ['/API/DOCS'],
  ])('RF-000-10: %s es de la documentación', (url) => {
    expect(isDocsPath(url)).toBe(true);
  });

  it.each([['/health'], ['/api/docsx'], ['/api/docs-json'], ['/x/api/docs'], ['/']])(
    'RF-000-10: %s no lo es',
    (url) => {
      expect(isDocsPath(url)).toBe(false);
    },
  );
});

describe('buildSecurityHeaders (RF-000-10)', () => {
  it('RF-000-10: aplica las cabeceras de helmet', async () => {
    const res = await request(handlerWith(true)).get('/health');

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['strict-transport-security']).toMatch(/max-age=\d+/);
    expect(res.headers['x-frame-options']).toBeDefined();
  });

  it('RF-000-10: la CSP de una ruta normal es la estricta de helmet, con o sin Swagger', async () => {
    for (const swaggerEnabled of [true, false]) {
      const res = await request(handlerWith(swaggerEnabled)).get('/health');
      const csp = String(res.headers['content-security-policy']);

      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("script-src 'self'");
      expect(csp).toContain('upgrade-insecure-requests');
      expect(csp).not.toContain("script-src 'self' 'unsafe-inline'");
    }
  });

  it('RF-000-10: /api/docs relaja solo upgrade-insecure-requests y solo con Swagger montado', async () => {
    const res = await request(handlerWith(true)).get('/api/docs');
    const csp = String(res.headers['content-security-policy']);

    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toContain('upgrade-insecure-requests');
    expect(csp).not.toContain('unsafe-eval');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('RF-000-10: con Swagger sin montar, /api/docs conserva la CSP estricta', async () => {
    const res = await request(handlerWith(false)).get('/api/docs');

    expect(String(res.headers['content-security-policy'])).toContain('upgrade-insecure-requests');
  });

  it('RF-000-10: /api/docs-json lleva la CSP estricta (no es una página)', async () => {
    const res = await request(handlerWith(true)).get('/api/docs-json');

    expect(String(res.headers['content-security-policy'])).toContain('upgrade-insecure-requests');
  });
});
