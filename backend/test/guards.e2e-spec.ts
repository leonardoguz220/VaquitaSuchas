import { jest } from '@jest/globals';
import {
  Controller,
  Get,
  Logger,
  Post,
  Req,
  UseGuards,
  type INestApplication,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { Clock } from '../src/shared/clock/clock.js';
import { ClockModule } from '../src/shared/clock/clock.module.js';
import { FakeClock } from '../src/shared/clock/fake-clock.js';
import { ErrorsModule } from '../src/shared/errors/errors.module.js';
import { AdminGuard } from '../src/shared/guards/admin.guard.js';
import { AuthGuard } from '../src/shared/guards/auth.guard.js';
import type { AuthenticatedRequest } from '../src/shared/guards/authenticated-request.js';
import { JobsTokenGuard } from '../src/shared/guards/jobs-token.guard.js';
import { signHs256Jwt } from '../src/shared/guards/jwt-hs256.js';
import { AUTH_SESSION_PORT } from '../src/shared/ports/auth-session.port.js';
import type {
  AuthenticatedUser,
  AuthSessionPort,
  SessionClaims,
} from '../src/shared/ports/auth-session.port.js';

const JWT_SECRET = 'secreto-e2e-de-al-menos-treinta-y-dos-caracteres';
const OTHER_SECRET = 'otro-secreto-e2e-de-al-menos-treinta-y-dos-car';
const JOBS_TOKEN = 'j'.repeat(64);
const NOW = '2026-10-18T12:00:00.000Z';
const NOW_S = Date.parse(NOW) / 1000;
const MEMBER_ID = '11111111-1111-4111-8111-111111111111';
const ADMIN_ID = '22222222-2222-4222-8222-222222222222';
const SUSPENDED_ID = '33333333-3333-4333-8333-333333333333';
const UNKNOWN_ID = '44444444-4444-4444-8444-444444444444';

/** Doble del puerto: la spec 003 lo implementará con la tabla `users`. */
class FakeAuthSession implements AuthSessionPort {
  readonly users = new Map<string, { sv: number; active: boolean; role: 'usuario' | 'admin' }>([
    [MEMBER_ID, { sv: 1, active: true, role: 'usuario' }],
    [ADMIN_ID, { sv: 1, active: true, role: 'admin' }],
    [SUSPENDED_ID, { sv: 1, active: false, role: 'usuario' }],
  ]);

  resolveSession(claims: SessionClaims): Promise<AuthenticatedUser | null> {
    const user = this.users.get(claims.sub);
    const current = user && user.active && user.sv === claims.sv;
    return Promise.resolve(current ? { id: claims.sub, role: user.role } : null);
  }
}

// Controlador de prueba: monta los guards reales como lo harán los módulos de negocio.
@Controller('guarded')
class GuardedController {
  @UseGuards(AuthGuard)
  @Get('me')
  me(@Req() req: AuthenticatedRequest): AuthenticatedUser | undefined {
    return req.user;
  }

  @UseGuards(AuthGuard, AdminGuard)
  @Get('admin')
  admin(): { ok: true } {
    return { ok: true };
  }

  // Orden equivocado a propósito: AdminGuard sin AuthGuard antes.
  @UseGuards(AdminGuard)
  @Get('admin-without-auth')
  adminWithoutAuth(): { ok: true } {
    return { ok: true };
  }

  @UseGuards(JobsTokenGuard)
  @Post('jobs')
  jobs(): { ran: [] } {
    return { ran: [] };
  }
}

const token = (claims: Record<string, unknown> = {}, secret = JWT_SECRET): string =>
  signHs256Jwt({ sub: MEMBER_ID, sv: 1, iat: NOW_S - 60, exp: NOW_S + 3600, ...claims }, secret);

const bearer = (jwt: string): string => `Bearer ${jwt}`;

describe('Guards compartidos (RF-000-11)', () => {
  let app: INestApplication;
  let clock: FakeClock;
  let sessions: FakeAuthSession;
  let loggers: jest.SpiedFunction<Logger['error']>[];

  beforeAll(async () => {
    clock = new FakeClock(NOW);
    sessions = new FakeAuthSession();
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          ignoreEnvFile: true,
          isGlobal: true,
          load: [() => ({ JWT_SECRET, JOBS_TOKEN })],
        }),
        ClockModule,
        ErrorsModule,
      ],
      controllers: [GuardedController],
      providers: [AuthGuard, { provide: AUTH_SESSION_PORT, useValue: sessions }],
    })
      .overrideProvider(Clock)
      .useValue(clock)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    loggers = [
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined),
      jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined),
      jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined),
      jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined),
    ];
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const http = () => request(app.getHttpServer());

  const unauthenticatedBody = {
    statusCode: 401,
    code: 'UNAUTHENTICATED',
    message: 'Debes iniciar sesión para continuar.',
  };

  describe('AuthGuard', () => {
    it('RF-000-11: una sesión vigente accede y el controlador ve el usuario autenticado', async () => {
      const res = await http().get('/guarded/me').set('Authorization', bearer(token()));

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ id: MEMBER_ID, role: 'usuario' });
    });

    it('RF-000-11: sin token responde 401 UNAUTHENTICATED en el formato A.2', async () => {
      const res = await http().get('/guarded/me');

      expect(res.status).toBe(401);
      expect(res.body).toEqual(unauthenticatedBody);
    });

    it.each([
      ['basura', 'Bearer esto-no-es-un-jwt'],
      ['esquema distinto', `Basic ${token()}`],
      ['sin esquema', token()],
    ])('RF-000-11: una cabecera Authorization con %s responde 401', async (_name, header) => {
      const res = await http().get('/guarded/me').set('Authorization', header);

      expect(res.status).toBe(401);
      expect(res.body).toEqual(unauthenticatedBody);
    });

    it('RF-000-11: un token firmado con otra clave responde 401', async () => {
      const res = await http()
        .get('/guarded/me')
        .set('Authorization', bearer(token({}, OTHER_SECRET)));

      expect(res.status).toBe(401);
      expect(res.body).toEqual(unauthenticatedBody);
    });

    it('RF-000-11: un token manipulado (payload cambiado a admin) responde 401', async () => {
      const [header, , signature] = token().split('.');
      const payload = Buffer.from(
        JSON.stringify({ sub: ADMIN_ID, sv: 1, iat: NOW_S, exp: NOW_S + 3600 }),
      ).toString('base64url');

      const res = await http()
        .get('/guarded/me')
        .set('Authorization', bearer(`${header}.${payload}.${signature}`));

      expect(res.status).toBe(401);
      expect(res.body).toEqual(unauthenticatedBody);
    });

    it('RF-000-11: un token con alg none responde 401', async () => {
      const part = (value: unknown): string =>
        Buffer.from(JSON.stringify(value)).toString('base64url');
      const unsigned = `${part({ alg: 'none', typ: 'JWT' })}.${part({ sub: ADMIN_ID, sv: 1, iat: NOW_S, exp: NOW_S + 3600 })}.`;

      const res = await http().get('/guarded/me').set('Authorization', bearer(unsigned));

      expect(res.status).toBe(401);
      expect(res.body).toEqual(unauthenticatedBody);
    });

    it('RF-000-11: un token vencido responde 401 con el mismo cuerpo que uno mal firmado', async () => {
      const expired = await http()
        .get('/guarded/me')
        .set('Authorization', bearer(token({ exp: NOW_S - 1 })));
      const forged = await http()
        .get('/guarded/me')
        .set('Authorization', bearer(token({}, OTHER_SECRET)));

      expect(expired.status).toBe(401);
      expect(expired.body).toEqual(forged.body);
      expect(expired.text).toBe(forged.text);
    });

    it('RF-000-11: un token que vence al avanzar el reloj deja de servir', async () => {
      const jwt = token({ exp: NOW_S + 60 });
      const before = await http().get('/guarded/me').set('Authorization', bearer(jwt));
      // El reloj no retrocede: avanzar 61 s no afecta a los demás tests (sus tokens duran 1 hora).
      clock.advance(61 * 1000);
      const after = await http().get('/guarded/me').set('Authorization', bearer(jwt));

      expect(before.status).toBe(200);
      expect(after.status).toBe(401);
    });

    it.each([
      ['la versión de sesión cambió', { sv: 0 }],
      ['el usuario está suspendido', { sub: SUSPENDED_ID }],
      ['el usuario no existe', { sub: UNKNOWN_ID }],
    ])(
      'RF-000-11: si el puerto no ve la sesión vigente (%s) responde 401 idéntico',
      async (_name, claims) => {
        const res = await http()
          .get('/guarded/me')
          .set('Authorization', bearer(token(claims)));

        expect(res.status).toBe(401);
        expect(res.body).toEqual(unauthenticatedBody);
      },
    );

    it('RF-000-11: el cuerpo de error y el log no incluyen el token', async () => {
      const jwt = token({ exp: NOW_S - 1 });

      const res = await http().get('/guarded/me').set('Authorization', bearer(jwt));

      expect(res.text).not.toContain(jwt);
      expect(JSON.stringify(loggers.map((spy) => spy.mock.calls))).not.toContain(jwt);
      expect(Object.keys(res.body).sort()).toEqual(['code', 'message', 'statusCode']);
    });
  });

  describe('AdminGuard', () => {
    it('RF-000-11: un admin autenticado accede a la ruta de administración', async () => {
      const res = await http()
        .get('/guarded/admin')
        .set('Authorization', bearer(token({ sub: ADMIN_ID })));

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
    });

    it('RF-000-11: un usuario autenticado sin rol admin recibe 403 FORBIDDEN', async () => {
      const res = await http().get('/guarded/admin').set('Authorization', bearer(token()));

      expect(res.status).toBe(403);
      expect(res.body).toEqual({
        statusCode: 403,
        code: 'FORBIDDEN',
        message: 'No tienes permiso para realizar esta acción.',
      });
    });

    it('RF-000-11: sin token en una ruta de administración responde 401, no 403', async () => {
      const res = await http().get('/guarded/admin');

      expect(res.status).toBe(401);
      expect(res.body).toEqual(unauthenticatedBody);
    });

    it('RF-000-11: un admin con la sesión revocada responde 401, no 200', async () => {
      const res = await http()
        .get('/guarded/admin')
        .set('Authorization', bearer(token({ sub: ADMIN_ID, sv: 99 })));

      expect(res.status).toBe(401);
    });

    it('RF-000-11: AdminGuard sin AuthGuard antes responde 401 aunque se envíe un token de admin', async () => {
      const res = await http()
        .get('/guarded/admin-without-auth')
        .set('Authorization', bearer(token({ sub: ADMIN_ID })));

      expect(res.status).toBe(401);
      expect(res.body).toEqual(unauthenticatedBody);
    });
  });

  describe('JobsTokenGuard', () => {
    const credentialBody = {
      statusCode: 401,
      code: 'UNAUTHENTICATED',
      message: 'Credencial de servicio inválida.',
    };

    it('RF-000-11: con el X-Jobs-Token correcto la ruta responde 201', async () => {
      const res = await http().post('/guarded/jobs').set('X-Jobs-Token', JOBS_TOKEN);

      expect(res.status).toBe(201);
      expect(res.body).toEqual({ ran: [] });
    });

    it('RF-000-11: sin X-Jobs-Token responde 401 UNAUTHENTICATED en el formato A.2', async () => {
      const res = await http().post('/guarded/jobs');

      expect(res.status).toBe(401);
      expect(res.body).toEqual(credentialBody);
    });

    it('RF-000-11: con un X-Jobs-Token incorrecto responde 401 idéntico y sin eco del valor', async () => {
      const sent = 'token-equivocado-que-no-debe-aparecer';

      const res = await http().post('/guarded/jobs').set('X-Jobs-Token', sent);

      expect(res.status).toBe(401);
      expect(res.body).toEqual(credentialBody);
      expect(res.text).not.toContain(sent);
      expect(res.text).not.toContain(JOBS_TOKEN);
      expect(JSON.stringify(loggers.map((spy) => spy.mock.calls))).not.toContain(sent);
    });

    it('RF-000-11: un JWT de usuario admin no sustituye al X-Jobs-Token', async () => {
      const res = await http()
        .post('/guarded/jobs')
        .set('Authorization', bearer(token({ sub: ADMIN_ID })));

      expect(res.status).toBe(401);
    });

    it('RF-000-11: un X-Jobs-Token de otra longitud no provoca un error 500', async () => {
      const res = await http().post('/guarded/jobs').set('X-Jobs-Token', 'x');

      expect(res.status).toBe(401);
    });
  });
});
