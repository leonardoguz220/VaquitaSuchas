import { LOGIN_PATH, PUBLIC_ROUTES, buildLoginRedirect, isPublicPath } from './routes';

describe('routes (RF-000-15, RF-000-16)', () => {
  it('RF-000-15: la lista de rutas públicas es la del plan §6', () => {
    expect(PUBLIC_ROUTES).toEqual(['/ingresar', '/registro', '/recuperar', '/estado']);
    expect(LOGIN_PATH).toBe('/ingresar');
  });

  it.each(['/ingresar', '/registro', '/recuperar', '/estado'])(
    'RF-000-15: %s es pública',
    (path) => {
      expect(isPublicPath(path)).toBe(true);
    },
  );

  it.each(['/registro/verificar', '/recuperar/abc123', '/ingresar/', '/estado/detalle'])(
    'RF-000-15: la subruta %s es pública',
    (path) => {
      expect(isPublicPath(path)).toBe(true);
    },
  );

  it.each(['/', '/grupos', '/registrox', '/ingresar-admin', '/estados', '/admin/estado', ''])(
    'RF-000-15: %s no es pública (sin prefijos falsos)',
    (path) => {
      expect(isPublicPath(path)).toBe(false);
    },
  );

  it('RF-000-15: buildLoginRedirect conserva la ruta y la query en next=', () => {
    expect(buildLoginRedirect('/grupos', '')).toBe('/ingresar?next=%2Fgrupos');
    expect(buildLoginRedirect('/grupos/1', '?codigo=AB12&x=1')).toBe(
      '/ingresar?next=%2Fgrupos%2F1%3Fcodigo%3DAB12%26x%3D1',
    );
  });

  it('RF-000-15: buildLoginRedirect no agrega next= para la raíz', () => {
    expect(buildLoginRedirect('/', '')).toBe('/ingresar');
  });
});
