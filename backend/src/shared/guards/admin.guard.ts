import { Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { DomainError } from '../errors/domain-error.js';
import { DEFAULT_MESSAGES, ErrorCode } from '../errors/error-codes.js';
import type { AuthenticatedRequest } from './authenticated-request.js';

/**
 * Exige `role = 'admin'` (`contracts/api.md` A.4). No autentica: lee `request.user`, así que debe
 * ir DESPUÉS de `AuthGuard`: `@UseGuards(AuthGuard, AdminGuard)`. Si falta el usuario (el orden
 * está mal o la ruta no tiene `AuthGuard`) responde 401 y no 403: sin sesión nunca se debe sugerir
 * que la persona está identificada.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest<AuthenticatedRequest>().user;

    if (!user) {
      throw new DomainError(ErrorCode.UNAUTHENTICATED, 401, DEFAULT_MESSAGES.UNAUTHENTICATED);
    }
    if (user.role !== 'admin') {
      throw new DomainError(ErrorCode.FORBIDDEN, 403, DEFAULT_MESSAGES.FORBIDDEN);
    }
    return true;
  }
}
