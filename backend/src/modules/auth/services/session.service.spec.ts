import { jest } from '@jest/globals';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { of } from 'rxjs';
import type { Clock } from '../../../shared/clock/clock.js';
import { verifyHs256Jwt } from '../../../shared/guards/jwt-hs256.js';
import { SessionRenewalInterceptor } from '../controllers/session-renewal.interceptor.js';
import { AuthSessionRepository } from '../repositories/auth-session.repository.js';
import { AuthSessionService } from './auth-session.service.js';
import { SessionService } from './session.service.js';

const SECRET = 's'.repeat(32);
const USER = '0b1c2d3e-0000-4000-8000-000000000001';
const NOW = new Date('2026-10-19T12:00:00Z');
const nowSec = NOW.getTime() / 1000;

const config = { getOrThrow: () => SECRET } as unknown as ConfigService;
const clock = { now: () => NOW } as unknown as Clock;

describe('SessionService', () => {
  const sessions = new SessionService(config, clock);

  it('RF-003-06: issue firma un JWT HS256 con sub, sv, iat y exp a 7 días', () => {
    const token = sessions.issue({ id: USER, sessionVersion: 3 });
    expect(verifyHs256Jwt(token, SECRET, NOW.getTime())).toEqual({
      sub: USER,
      sv: 3,
      iat: nowSec,
      exp: nowSec + 7 * 86400,
    });
  });

  it('CA-003-20: un token firmado con otra clave no verifica', () => {
    const token = sessions.issue({ id: USER, sessionVersion: 0 });
    expect(verifyHs256Jwt(token, 'x'.repeat(32), NOW.getTime())).toBeNull();
  });

  it('RF-003-07: renueva con la misma sv cuando quedan menos de 6 días', () => {
    const claims = { sub: USER, sv: 5, iat: nowSec - 2 * 86400, exp: nowSec + 5 * 86400 };
    const token = sessions.renewIfNeeded(claims);
    expect(token).not.toBeNull();
    expect(verifyHs256Jwt(token as string, SECRET, NOW.getTime())?.sv).toBe(5);
  });

  it('RF-003-07: no renueva un token recién emitido', () => {
    const claims = { sub: USER, sv: 5, iat: nowSec, exp: nowSec + 7 * 86400 };
    expect(sessions.renewIfNeeded(claims)).toBeNull();
  });
});

describe('SessionRenewalInterceptor', () => {
  const run = (claims: unknown) => {
    const setHeader = jest.fn();
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({ sessionClaims: claims }),
        getResponse: () => ({ setHeader }),
      }),
    } as unknown as ExecutionContext;
    new SessionRenewalInterceptor(new SessionService(config, clock)).intercept(context, {
      handle: () => of(null),
    } as CallHandler);
    return setHeader;
  };

  it('RF-003-07: pone X-Session-Token cuando la sesión está por vencer', () => {
    const setHeader = run({ sub: USER, sv: 1, iat: 0, exp: nowSec + 86400 });
    expect(setHeader).toHaveBeenCalledWith('X-Session-Token', expect.any(String));
  });

  it('RF-003-07: no pone la cabecera sin sesión o con sesión reciente', () => {
    expect(run(undefined)).not.toHaveBeenCalled();
    expect(run({ sub: USER, sv: 1, iat: nowSec, exp: nowSec + 7 * 86400 })).not.toHaveBeenCalled();
  });
});

describe('AuthSessionService', () => {
  it('CA-003-33: consulta por id y session_version, solo usuarios activos y verificados', async () => {
    const query = jest.fn(() => Promise.resolve({ rows: [] }));
    const repo = new AuthSessionRepository({ query } as never);
    const service = new AuthSessionService(repo);
    await expect(service.resolveSession({ sub: USER, sv: 2, iat: 0, exp: 1 })).resolves.toBeNull();
    const [sql, params] = query.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain("status = 'activo'");
    expect(sql).toContain('verified_at IS NOT NULL');
    expect(sql).toContain('session_version = $2');
    expect(params).toEqual([USER, 2]);
  });
});
