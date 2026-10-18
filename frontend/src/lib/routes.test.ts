import {
  LOGIN_PATH,
  PUBLIC_ROUTES,
  buildAuthLink,
  buildLoginRedirect,
  isPublicPath,
  resolvePostLoginPath,
  safeNextPath,
} from './routes';

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

describe('buildAuthLink (plan 003 §6)', () => {
  it('RF-003-01: sin parámetros devuelve la ruta sola', () => {
    expect(buildAuthLink('/ingresar')).toBe('/ingresar');
    expect(buildAuthLink('/ingresar', { otro: 'x' })).toBe('/ingresar');
  });

  it('RF-003-01: conserva codigo y next para el invitado que llega con un código', () => {
    expect(buildAuthLink('/ingresar', { codigo: 'AB12CD', next: '/unirse?codigo=AB12CD' })).toBe(
      '/ingresar?codigo=AB12CD&next=%2Funirse%3Fcodigo%3DAB12CD',
    );
  });

  it('RF-003-01: con valores repetidos toma solo el primero', () => {
    expect(buildAuthLink('/ingresar', { codigo: ['A1', 'B2'] })).toBe('/ingresar?codigo=A1');
  });
});

describe('safeNextPath (spec 003 T029, redirección abierta)', () => {
  it.each(['/grupos', '/grupos/1?tab=cobros', '/unirse?codigo=AB12CD34', '/', '/a/b#c'])(
    'RF-003-08: acepta la ruta interna %s',
    (path) => {
      expect(safeNextPath(path)).toBe(path);
    },
  );

  it.each([
    '//evil.com',
    '/\\evil.com',
    '\\\\evil.com',
    '/grupos\\..\\..\\evil.com',
    'https://evil.com',
    'http://evil.com/grupos',
    'javascript:alert(1)',
    '%2F%2Fevil.com',
    '/\t/evil.com',
    '/\n/evil.com',
    ' /grupos',
    'grupos',
    '',
  ])('RF-003-08: rechaza el destino inseguro %j', (value) => {
    expect(safeNextPath(value)).toBeNull();
  });

  it('RF-003-08: sin valor devuelve null y con varios usa el primero', () => {
    expect(safeNextPath(undefined)).toBeNull();
    expect(safeNextPath(['/grupos', '//evil.com'])).toBe('/grupos');
    expect(safeNextPath(['//evil.com', '/grupos'])).toBeNull();
  });
});

describe('resolvePostLoginPath (spec 003 T029)', () => {
  it('RF-003-08: con next seguro vuelve a esa ruta, aunque venga codigo', () => {
    expect(resolvePostLoginPath({ next: '/grupos/1', codigo: 'AB12CD34' })).toBe('/grupos/1');
  });

  it('RF-003-08: con next inseguro lo ignora y va a la raíz', () => {
    expect(resolvePostLoginPath({ next: '//evil.com' })).toBe('/');
    expect(resolvePostLoginPath({ next: 'https://evil.com' })).toBe('/');
  });

  it('RF-003-08: con codigo y sin next va a /unirse?codigo= (plan 010 §6)', () => {
    expect(resolvePostLoginPath({ codigo: 'AB12CD34' })).toBe('/unirse?codigo=AB12CD34');
    expect(resolvePostLoginPath({ codigo: 'A&B' })).toBe('/unirse?codigo=A%26B');
  });

  it('RF-003-08: con next inseguro y codigo va a /unirse', () => {
    expect(resolvePostLoginPath({ next: '//evil.com', codigo: 'AB12CD34' })).toBe(
      '/unirse?codigo=AB12CD34',
    );
  });

  it('RF-003-08: sin parámetros va a la raíz, que redirige según la sesión', () => {
    expect(resolvePostLoginPath()).toBe('/');
    expect(resolvePostLoginPath({ codigo: '  ' })).toBe('/');
  });
});
