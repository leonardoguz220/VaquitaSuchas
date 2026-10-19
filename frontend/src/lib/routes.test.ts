import {
  DEV_TELEGRAM_PATH,
  LOGIN_PATH,
  PUBLIC_ROUTES,
  REGISTER_VERIFY_PATH,
  buildAuthLink,
  buildLoginRedirect,
  isPublicPath,
  isTelegramDevMode,
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

  it('RF-003-21: /registro/verificar es pública (subruta de /registro)', () => {
    expect(REGISTER_VERIFY_PATH).toBe('/registro/verificar');
    expect(isPublicPath(REGISTER_VERIFY_PATH)).toBe(true);
  });

  describe('/dev/telegram según NEXT_PUBLIC_TELEGRAM_MODE (plan 003 §6)', () => {
    const original = process.env.NEXT_PUBLIC_TELEGRAM_MODE;
    afterEach(() => {
      if (original === undefined) delete process.env.NEXT_PUBLIC_TELEGRAM_MODE;
      else process.env.NEXT_PUBLIC_TELEGRAM_MODE = original;
    });

    it('RF-003-21: con NEXT_PUBLIC_TELEGRAM_MODE=dev, /dev/telegram es pública', () => {
      process.env.NEXT_PUBLIC_TELEGRAM_MODE = 'dev';
      expect(isTelegramDevMode()).toBe(true);
      expect(isPublicPath(DEV_TELEGRAM_PATH)).toBe(true);
      expect(isPublicPath('/dev/telegram/')).toBe(true);
      expect(isPublicPath('/dev/telegramx')).toBe(false);
      expect(isPublicPath('/dev')).toBe(false);
    });

    it.each([undefined, '', 'webhook', 'DEV'])(
      'RF-003-21: con NEXT_PUBLIC_TELEGRAM_MODE=%s, /dev/telegram no es pública',
      (mode) => {
        if (mode === undefined) delete process.env.NEXT_PUBLIC_TELEGRAM_MODE;
        else process.env.NEXT_PUBLIC_TELEGRAM_MODE = mode;
        expect(isTelegramDevMode()).toBe(false);
        expect(isPublicPath(DEV_TELEGRAM_PATH)).toBe(false);
      },
    );

    it('RF-003-21: /dev/telegram no está en la lista fija de rutas públicas', () => {
      expect(PUBLIC_ROUTES).not.toContain(DEV_TELEGRAM_PATH);
    });
  });

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
