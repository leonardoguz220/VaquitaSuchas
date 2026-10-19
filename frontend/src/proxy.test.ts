/** @jest-environment node */
import { NextRequest } from 'next/server';
import { config, proxy } from './proxy';

const APP = 'http://localhost:3000';

function run(path: string, cookie?: string) {
  const headers = cookie ? { cookie } : undefined;
  return proxy(new NextRequest(`${APP}${path}`, { headers }));
}

function matches(path: string): boolean {
  return config.matcher.some((source) => new RegExp(`^${source}$`).test(path));
}

describe('proxy.ts (RF-000-15)', () => {
  it('RF-000-15: sin cookie en una ruta protegida redirige a /ingresar con next=', () => {
    const res = run('/grupos');
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe(`${APP}/ingresar?next=%2Fgrupos`);
  });

  it('RF-000-15: conserva la query original en next=', () => {
    const res = run('/grupos/1?codigo=AB12');
    expect(res.headers.get('location')).toBe(`${APP}/ingresar?next=%2Fgrupos%2F1%3Fcodigo%3DAB12`);
  });

  it('RF-000-15: la raíz sin cookie redirige a /ingresar sin next=', () => {
    expect(run('/').headers.get('location')).toBe(`${APP}/ingresar`);
  });

  it('RF-000-15: con la cookie vq_session deja pasar la ruta protegida', () => {
    const res = run('/grupos', 'vq_session=jwt');
    expect(res.headers.get('location')).toBeNull();
    expect(res.headers.get('x-middleware-next')).toBe('1');
  });

  it('RF-000-15: con una cookie vq_session vacía redirige', () => {
    expect(run('/grupos', 'vq_session=').status).toBe(307);
  });

  it.each(['/ingresar', '/registro/verificar', '/recuperar/abc', '/estado'])(
    'RF-000-15: la ruta pública %s no redirige sin cookie',
    (path) => {
      expect(run(path).headers.get('location')).toBeNull();
    },
  );

  it('RF-000-15: con cookie en /ingresar no redirige (lo decide la pantalla)', () => {
    expect(run('/ingresar', 'vq_session=jwt').headers.get('location')).toBeNull();
  });

  it.each(['/grupos', '/', '/registrox', '/apiario', '/admin/usuarios'])(
    'RF-000-15: el matcher intercepta %s',
    (path) => {
      expect(matches(path)).toBe(true);
    },
  );

  it.each([
    '/api/health',
    '/api',
    '/_next/static/chunks/a.js',
    '/_next/image',
    '/favicon.ico',
    '/logo.svg',
    '/robots.txt',
  ])('RF-000-15: el matcher no intercepta %s', (path) => {
    expect(matches(path)).toBe(false);
  });
});

describe('proxy.ts con las rutas de la spec 010 (T017)', () => {
  it.each(['/unirse', '/solicitudes', '/solicitudes/jr1'])(
    'RF-010-01: %s sin sesión redirige a /ingresar',
    (path) => {
      expect(matches(path)).toBe(true);
      expect(run(path).status).toBe(307);
    },
  );

  it('RF-010-01: /unirse?codigo= conserva el código en next=', () => {
    expect(run('/unirse?codigo=K7M2Q9XA').headers.get('location')).toBe(
      `${APP}/ingresar?next=%2Funirse%3Fcodigo%3DK7M2Q9XA`,
    );
  });
});
