import { jest } from '@jest/globals';
import type { ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { FakeClock } from '../clock/fake-clock.js';
import { DomainError } from '../errors/domain-error.js';
import type {
  AuthSessionPort,
  AuthenticatedUser,
  SessionClaims,
} from '../ports/auth-session.port.js';
import { AuthGuard } from './auth.guard.js';
import type { AuthenticatedRequest } from './authenticated-request.js';
import { signHs256Jwt } from './jwt-hs256.js';

const SECRET = 'secreto-de-prueba-con-al-menos-32-caracteres';
const USER_ID = '3f2b8c1e-6a4d-4f5b-9a7c-1d2e3f4a5b6c';
const NOW = '2026-10-18T12:00:00.000Z';
const NOW_S = Date.parse(NOW) / 1000;

const config = { getOrThrow: () => SECRET } as unknown as ConfigService;

function contextFor(request: Partial<AuthenticatedRequest>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

const validToken = (override: Record<string, unknown> = {}): string =>
  signHs256Jwt({ sub: USER_ID, sv: 2, iat: NOW_S - 10, exp: NOW_S + 600, ...override }, SECRET);

async function rejection(promise: Promise<unknown>): Promise<DomainError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(DomainError);
    return error as DomainError;
  }
  throw new Error('Se esperaba que el guard rechazara la petición.');
}

describe('AuthGuard (RF-000-11)', () => {
  let resolveSession: jest.Mock<AuthSessionPort['resolveSession']>;
  let guard: AuthGuard;
  const user: AuthenticatedUser = { id: USER_ID, role: 'usuario' };

  beforeEach(() => {
    resolveSession = jest.fn<AuthSessionPort['resolveSession']>().mockResolvedValue(user);
    guard = new AuthGuard(config, new FakeClock(NOW), { resolveSession });
  });

  it('RF-000-11: con un Bearer válido y sesión vigente deja pasar y fija request.user', async () => {
    const request: Partial<AuthenticatedRequest> = {
      headers: { authorization: `Bearer ${validToken()}` },
    };

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);

    expect(request.user).toEqual(user);
    expect(request.sessionClaims).toEqual({
      sub: USER_ID,
      sv: 2,
      iat: NOW_S - 10,
      exp: NOW_S + 600,
    });
  });

  it('RF-000-11: entrega al puerto solo sub y sv del token', async () => {
    await guard.canActivate(contextFor({ headers: { authorization: `Bearer ${validToken()}` } }));

    expect(resolveSession).toHaveBeenCalledTimes(1);
    const claims = resolveSession.mock.calls[0]?.[0] as SessionClaims;
    expect(claims).toMatchObject({ sub: USER_ID, sv: 2 });
  });

  it('RF-000-11: el esquema Bearer no distingue mayúsculas', async () => {
    const request: Partial<AuthenticatedRequest> = {
      headers: { authorization: `bearer ${validToken()}` },
    };

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
  });

  it.each([
    ['sin cabecera Authorization', undefined],
    ['cabecera vacía', ''],
    ['solo el esquema', 'Bearer'],
    ['esquema Basic', 'Basic dXNlcjpwYXNz'],
    ['token sin esquema', 'abc.def.ghi'],
    ['dos tokens', 'Bearer a.b.c d.e.f'],
  ])(
    'RF-000-11: %s responde 401 UNAUTHENTICATED sin consultar el puerto',
    async (_name, header) => {
      const headers = header === undefined ? {} : { authorization: header };

      const error = await rejection(guard.canActivate(contextFor({ headers })));

      expect(error.httpStatus).toBe(401);
      expect(error.code).toBe('UNAUTHENTICATED');
      expect(resolveSession).not.toHaveBeenCalled();
    },
  );

  it('RF-000-11: un token firmado con otra clave responde 401 UNAUTHENTICATED', async () => {
    const forged = signHs256Jwt(
      { sub: USER_ID, sv: 2, iat: NOW_S, exp: NOW_S + 600 },
      'otra-clave-distinta-de-al-menos-32-caracteres',
    );

    const error = await rejection(
      guard.canActivate(contextFor({ headers: { authorization: `Bearer ${forged}` } })),
    );

    expect(error.httpStatus).toBe(401);
    expect(resolveSession).not.toHaveBeenCalled();
  });

  it('RF-000-11: un token vencido según el Clock responde 401 UNAUTHENTICATED', async () => {
    const clock = new FakeClock(NOW);
    guard = new AuthGuard(config, clock, { resolveSession });
    const token = validToken();
    clock.advance(601 * 1000);

    const error = await rejection(
      guard.canActivate(contextFor({ headers: { authorization: `Bearer ${token}` } })),
    );

    expect(error.httpStatus).toBe(401);
    expect(error.code).toBe('UNAUTHENTICATED');
  });

  it('RF-000-11: si el puerto devuelve null (versión vieja, suspendido o sin verificar) responde 401', async () => {
    resolveSession.mockResolvedValue(null);
    const request: Partial<AuthenticatedRequest> = {
      headers: { authorization: `Bearer ${validToken()}` },
    };

    const error = await rejection(guard.canActivate(contextFor(request)));

    expect(error.httpStatus).toBe(401);
    expect(error.code).toBe('UNAUTHENTICATED');
    expect(request.user).toBeUndefined();
  });

  it('RF-000-11: el mensaje es el mismo para token inválido, vencido y sesión no vigente', async () => {
    const clock = new FakeClock(NOW);
    guard = new AuthGuard(config, clock, { resolveSession });
    const expired = validToken({ exp: NOW_S - 1 });
    const forged = `${validToken().slice(0, -2)}xx`;
    const notCurrent = validToken();
    resolveSession.mockResolvedValueOnce(null);

    const messages = await Promise.all(
      [forged, expired, notCurrent].map(async (token) =>
        rejection(guard.canActivate(contextFor({ headers: { authorization: `Bearer ${token}` } }))),
      ),
    );

    expect(new Set(messages.map((e) => e.message)).size).toBe(1);
    expect(new Set(messages.map((e) => JSON.stringify(e.details ?? null))).size).toBe(1);
  });

  it('RF-000-11: el mensaje de error no incluye el token', async () => {
    const token = validToken({ exp: NOW_S - 1 });

    const error = await rejection(
      guard.canActivate(contextFor({ headers: { authorization: `Bearer ${token}` } })),
    );

    expect(JSON.stringify({ message: error.message, details: error.details })).not.toContain(token);
  });

  it('RF-000-11: un fallo del puerto (por ejemplo la base caída) no se convierte en 401', async () => {
    resolveSession.mockRejectedValue(new Error('conexión caída'));

    await expect(
      guard.canActivate(contextFor({ headers: { authorization: `Bearer ${validToken()}` } })),
    ).rejects.toThrow('conexión caída');
  });
});
