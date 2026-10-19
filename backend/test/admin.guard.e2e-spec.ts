import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants.js';
import { DiscoveryService } from '@nestjs/core';
import { startAuthApp, type AuthTestApp } from './support/auth-app.js';

const SAMPLE_UUID = '3f2b8c1e-0a4d-4e7b-9c55-6d1f2a3b4c5d';
const VERBS: Record<number, 'get' | 'post' | 'put' | 'patch' | 'delete'> = {
  [RequestMethod.GET]: 'get',
  [RequestMethod.POST]: 'post',
  [RequestMethod.PUT]: 'put',
  [RequestMethod.PATCH]: 'patch',
  [RequestMethod.DELETE]: 'delete',
};

interface AdminRoute {
  verb: 'get' | 'post' | 'put' | 'patch' | 'delete';
  path: string;
}

/** Recorre los controladores registrados y devuelve todas las rutas que cuelgan de /admin. */
function discoverAdminRoutes(t: AuthTestApp): AdminRoute[] {
  const routes: AdminRoute[] = [];
  for (const wrapper of t.app.get(DiscoveryService).getControllers()) {
    const type = wrapper.metatype;
    if (!type) continue;
    const base = Reflect.getMetadata(PATH_METADATA, type) as string | string[] | undefined;
    const prefix = (Array.isArray(base) ? base[0] : base) ?? '';
    for (const name of Object.getOwnPropertyNames(type.prototype)) {
      const handler = (type.prototype as Record<string, unknown>)[name];
      if (typeof handler !== 'function') continue;
      const method = Reflect.getMetadata(METHOD_METADATA, handler) as number | undefined;
      if (method === undefined || VERBS[method] === undefined) continue;
      const sub = (Reflect.getMetadata(PATH_METADATA, handler) as string | undefined) ?? '';
      const full = `/${prefix}/${sub}`.replace(/\/+/g, '/').replace(/\/$/, '');
      if (full === '/admin' || full.startsWith('/admin/')) {
        routes.push({ verb: VERBS[method]!, path: full.replace(/:[A-Za-z]+/g, SAMPLE_UUID) });
      }
    }
  }
  return routes;
}

// Spec 009, US2: el acceso a administración se decide en el servidor en cada petición.
describe('AdminGuard en todas las rutas /admin (spec 009)', () => {
  let t: AuthTestApp;
  let routes: AdminRoute[];
  let normalToken: string;
  let adminToken: string;

  beforeAll(async () => {
    t = await startAuthApp();
    routes = discoverAdminRoutes(t);
    const normal = await t.createUser();
    const admin = await t.createUser();
    await t.db.query(`UPDATE users SET role = 'admin' WHERE id = $1`, [admin.id]);
    normalToken = (await t.login(normal.email, normal.password)).body.sessionToken as string;
    adminToken = (await t.login(admin.email, admin.password)).body.sessionToken as string;
  }, 60_000);
  afterAll(async () => {
    await t?.close();
  }, 30_000);

  it('el recorrido automático encuentra rutas /admin (incluida la de auditoría)', () => {
    expect(routes.length).toBeGreaterThan(0);
    expect(routes).toContainEqual({ verb: 'get', path: '/admin/audit-log' });
  });

  it('CA-009-01 (RNF-009-01): un usuario normal recibe 403 FORBIDDEN en todas las rutas /admin', async () => {
    for (const route of routes) {
      const res = await t
        .http()
        [route.verb](route.path)
        .set('Authorization', `Bearer ${normalToken}`)
        .send({});
      expect({ route, status: res.status, code: res.body.code }).toEqual({
        route,
        status: 403,
        code: 'FORBIDDEN',
      });
    }
  });

  it('CA-009-01: sin sesión toda ruta /admin responde 401, nunca 403', async () => {
    for (const route of routes) {
      const res = await t.http()[route.verb](route.path).send({});
      expect({ route, status: res.status }).toEqual({ route, status: 401 });
    }
  });

  it('RNF-009-01: el rol se lee de la base en cada petición, no del token', async () => {
    const before = await t
      .http()
      .get('/admin/audit-log')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(before.status).toBe(200);
    const { rows } = await t.db.query<{ id: string }>(`SELECT id FROM users WHERE role = 'admin'`);
    const extra = await t.createUser();
    await t.db.query(`UPDATE users SET role = 'admin' WHERE id = $1`, [extra.id]);
    // Con otro administrador activo se puede quitar el rol al primero (RN-009-01).
    await t.db.query(`UPDATE users SET role = 'usuario' WHERE id = $1`, [rows[0]!.id]);
    const after = await t
      .http()
      .get('/admin/audit-log')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(after.status).toBe(403);
  });
});
