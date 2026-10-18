import { Inject, Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Clock } from '../clock/clock.js';
import { DomainError } from '../errors/domain-error.js';
import { DEFAULT_MESSAGES, ErrorCode } from '../errors/error-codes.js';
import { AUTH_SESSION_PORT } from '../ports/auth-session.port.js';
import type { AuthSessionPort } from '../ports/auth-session.port.js';
import type { AuthenticatedRequest } from './authenticated-request.js';
import { verifyHs256Jwt } from './jwt-hs256.js';

const BEARER = /^Bearer\s+(\S+)$/i;

/**
 * Exige sesión válida (`contracts/api.md` A.4): JWT `Authorization: Bearer` con firma HS256 y
 * vigencia correctas, y que el puerto `AuthSessionPort` confirme `session_version` vigente y
 * usuario `activo` y verificado. En éxito deja `request.user` y `request.sessionClaims`.
 *
 * Todo fallo responde el mismo `401 UNAUTHENTICATED` con el mismo mensaje: no dice si el token
 * estaba mal firmado, vencido o si la sesión se revocó, ni lo registra. Si el puerto lanza (base
 * caída) el error se propaga y el filtro global responde 500, no 401.
 *
 * Orden de uso: `@UseGuards(AuthGuard)` y, para rutas de administración, `@UseGuards(AuthGuard,
 * AdminGuard)`. Requiere un proveedor de `AUTH_SESSION_PORT` en el módulo del controlador (lo
 * aporta la spec 003); sin él la aplicación no arranca.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  private readonly jwtSecret: string;

  constructor(
    config: ConfigService,
    private readonly clock: Clock,
    @Inject(AUTH_SESSION_PORT) private readonly sessions: AuthSessionPort,
  ) {
    this.jwtSecret = config.getOrThrow<string>('JWT_SECRET');
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    const token = BEARER.exec(headerValue(request.headers?.authorization))?.[1];
    if (!token) throw unauthenticated();

    const claims = verifyHs256Jwt(token, this.jwtSecret, this.clock.now().getTime());
    if (!claims) throw unauthenticated();

    const user = await this.sessions.resolveSession(claims);
    if (!user) throw unauthenticated();

    request.user = user;
    request.sessionClaims = claims;
    return true;
  }
}

/** Una cabecera repetida o ausente no se interpreta: se trata como vacía. */
function headerValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function unauthenticated(): DomainError {
  return new DomainError(ErrorCode.UNAUTHENTICATED, 401, DEFAULT_MESSAGES.UNAUTHENTICATED);
}
