import {
  ADMIN_PATH,
  ADMIN_USERS_PATH,
  adminUserPath,
  isAdminPath,
  PANEL_HISTORY_PATH,
  PANEL_CALENDAR_PATH,
  PANEL_PATH,
  NOTIFICATION_SETTINGS_PATH,
  UNSUBSCRIBE_PATH,
  NOTIFICATIONS_PATH,
  safeInternalLink,
  CHARGES_PATH,
  chargePath,
  JOIN_PATH,
  REQUESTS_PATH,
  requestPath,
  DEV_TELEGRAM_PATH,
  GROUPS_PATH,
  NEW_GROUP_PATH,
  buildJoinPath,
  groupPath,
  LOGIN_PATH,
  PUBLIC_ROUTES,
  REGISTER_VERIFY_PATH,
  buildAuthLink,
  buildLoginRedirect,
  isPublicPath,
  isTelegramDevMode,
  resolvePostLoginPath,
  safeNextPath,
} from './routes';

describe('routes (RF-000-15, RF-000-16)', () => {
  it('RF-000-15: la lista de rutas públicas es la del plan §6', () => {
    expect(PUBLIC_ROUTES).toEqual([
      '/ingresar',
      '/registro',
      '/recuperar',
      '/estado',
      '/avisos/desactivar',
    ]);
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

  it.each(['/api/auth/me', '/api', '/ingresar', '/registro/verificar', '/recuperar?x=1'])(
    'RF-003-08: rechaza volver al proxy /api o a una pantalla pública: %s',
    (value) => {
      expect(safeNextPath(value)).toBeNull();
    },
  );

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

describe('rutas de grupos (plan 001 §6)', () => {
  it('RF-001-19: /grupos, /grupos/nuevo y /grupos/[id] son rutas protegidas', () => {
    expect(GROUPS_PATH).toBe('/grupos');
    expect(NEW_GROUP_PATH).toBe('/grupos/nuevo');
    expect(groupPath('g1')).toBe('/grupos/g1');
    expect(groupPath('a/b')).toBe('/grupos/a%2Fb');
    for (const path of [GROUPS_PATH, NEW_GROUP_PATH, groupPath('g1')]) {
      expect(isPublicPath(path)).toBe(false);
    }
  });

  it('RF-001-06: buildJoinPath arma /unirse?codigo=… con el código de invitación', () => {
    expect(buildJoinPath('K7M2Q9PX')).toBe('/unirse?codigo=K7M2Q9PX');
  });
});

describe('rutas de cobros (plan 002 §6)', () => {
  it('RF-002-15: /cobros y /cobros/[id] son rutas protegidas', () => {
    expect(CHARGES_PATH).toBe('/cobros');
    expect(chargePath('c1')).toBe('/cobros/c1');
    expect(chargePath('a/b')).toBe('/cobros/a%2Fb');
    for (const path of [CHARGES_PATH, chargePath('c1')]) {
      expect(isPublicPath(path)).toBe(false);
    }
  });
});

describe('rutas de solicitudes de ingreso (spec 010 T017)', () => {
  it('RF-010-01: /unirse, /solicitudes y el detalle exigen sesión', () => {
    expect(JOIN_PATH).toBe('/unirse');
    expect(REQUESTS_PATH).toBe('/solicitudes');
    expect(isPublicPath('/unirse')).toBe(false);
    expect(isPublicPath('/solicitudes')).toBe(false);
    expect(isPublicPath('/solicitudes/jr1')).toBe(false);
  });

  it('RF-010-26: requestPath codifica el id', () => {
    expect(requestPath('jr/1')).toBe('/solicitudes/jr%2F1');
  });

  it('RF-010-01: sin sesión, /unirse?codigo= vuelve a sí mismo tras ingresar', () => {
    const login = buildLoginRedirect('/unirse', '?codigo=K7M2Q9XA');
    expect(login).toBe('/ingresar?next=%2Funirse%3Fcodigo%3DK7M2Q9XA');
    const next = new URLSearchParams(login.split('?')[1]).get('next') ?? undefined;
    expect(resolvePostLoginPath({ next })).toBe('/unirse?codigo=K7M2Q9XA');
  });
});

describe('rutas de notificaciones (plan 005 §6)', () => {
  it('RF-005-01: /notificaciones es protegida', () => {
    expect(NOTIFICATIONS_PATH).toBe('/notificaciones');
    expect(isPublicPath(NOTIFICATIONS_PATH)).toBe(false);
  });

  it('RF-005-01: safeInternalLink acepta rutas internas y descarta enlaces externos', () => {
    expect(safeInternalLink('/cobros/c1')).toBe('/cobros/c1');
    expect(safeInternalLink('/solicitudes/jr1?tab=chat')).toBe('/solicitudes/jr1?tab=chat');
    for (const bad of [
      null,
      undefined,
      '',
      'https://evil.test',
      '//evil.test',
      '/\\evil',
      'cobros',
      '/a b',
    ]) {
      expect(safeInternalLink(bad)).toBeNull();
    }
  });
});

describe('rutas de ajustes de avisos (spec 005 T023)', () => {
  it('RF-005-17: /ajustes/avisos es protegida', () => {
    expect(NOTIFICATION_SETTINGS_PATH).toBe('/ajustes/avisos');
    expect(isPublicPath(NOTIFICATION_SETTINGS_PATH)).toBe(false);
  });

  it('RF-005-18: /avisos/desactivar es pública (el enlace del correo se abre sin sesión)', () => {
    expect(UNSUBSCRIBE_PATH).toBe('/avisos/desactivar');
    expect(isPublicPath(UNSUBSCRIBE_PATH)).toBe(true);
    expect(isPublicPath('/avisos')).toBe(false);
    expect(safeNextPath('/avisos/desactivar?token=x')).toBeNull();
  });
});

describe('rutas del panel (plan 006 §6)', () => {
  it('RF-006-01: /panel es protegida', () => {
    expect(PANEL_PATH).toBe('/panel');
    expect(isPublicPath(PANEL_PATH)).toBe(false);
  });

  it('RF-006-11: /panel/calendario es protegida', () => {
    expect(PANEL_CALENDAR_PATH).toBe('/panel/calendario');
    expect(isPublicPath(PANEL_CALENDAR_PATH)).toBe(false);
  });

  it('RF-006-13: /panel/historial es protegida', () => {
    expect(PANEL_HISTORY_PATH).toBe('/panel/historial');
    expect(isPublicPath(PANEL_HISTORY_PATH)).toBe(false);
  });
});

describe('rutas de administración (plan 009 §6)', () => {
  it('RF-009-01: /admin y sus subrutas son protegidas y se reconocen como de administración', () => {
    expect(ADMIN_PATH).toBe('/admin');
    expect(ADMIN_USERS_PATH).toBe('/admin/usuarios');
    expect(adminUserPath('u/1')).toBe('/admin/usuarios/u%2F1');
    expect(isPublicPath(ADMIN_PATH)).toBe(false);
    expect(isPublicPath(ADMIN_USERS_PATH)).toBe(false);
    expect(isAdminPath('/admin')).toBe(true);
    expect(isAdminPath('/admin/usuarios/u1')).toBe(true);
    expect(isAdminPath('/administrar')).toBe(false);
    expect(isAdminPath('/panel')).toBe(false);
  });
});
