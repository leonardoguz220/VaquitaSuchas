import { ParseUUIDPipe } from '@nestjs/common';
import { DomainError } from '../../../shared/errors/domain-error.js';
import { DEFAULT_MESSAGES, ErrorCode } from '../../../shared/errors/error-codes.js';
import type { AuthenticatedRequest } from '../../../shared/guards/authenticated-request.js';

/** Persona autenticada por `AuthGuard`; sin ella la petición no debió llegar al controlador. */
export function requireUserId(request: AuthenticatedRequest): string {
  const id = request.user?.id;
  if (!id) throw new DomainError(ErrorCode.UNAUTHENTICATED, 401, DEFAULT_MESSAGES.UNAUTHENTICATED);
  return id;
}

/** Un identificador mal formado es un recurso que no existe: 404, como un cobro ajeno. */
export const uuidParam = (): ParseUUIDPipe => new ParseUUIDPipe({ errorHttpStatusCode: 404 });
