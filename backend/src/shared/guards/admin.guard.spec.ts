import type { ExecutionContext } from '@nestjs/common';
import { DomainError } from '../errors/domain-error.js';
import { AdminGuard } from './admin.guard.js';
import type { AuthenticatedRequest } from './authenticated-request.js';

const contextFor = (request: Partial<AuthenticatedRequest>): ExecutionContext =>
  ({ switchToHttp: () => ({ getRequest: () => request }) }) as unknown as ExecutionContext;

function expectRejection(fn: () => unknown): DomainError {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(DomainError);
    return error as DomainError;
  }
  throw new Error('Se esperaba que el guard rechazara la petición.');
}

describe('AdminGuard (RF-000-11)', () => {
  const guard = new AdminGuard();

  it('RF-000-11: un usuario con role admin pasa', () => {
    const request = { user: { id: 'u1', role: 'admin' } } as Partial<AuthenticatedRequest>;

    expect(guard.canActivate(contextFor(request))).toBe(true);
  });

  it('RF-000-11: un usuario autenticado sin role admin recibe 403 FORBIDDEN', () => {
    const request = { user: { id: 'u1', role: 'usuario' } } as Partial<AuthenticatedRequest>;

    const error = expectRejection(() => guard.canActivate(contextFor(request)));

    expect(error.httpStatus).toBe(403);
    expect(error.code).toBe('FORBIDDEN');
  });

  it('RF-000-11: sin usuario autenticado (AuthGuard no corrió) recibe 401, no 403', () => {
    const error = expectRejection(() => guard.canActivate(contextFor({})));

    expect(error.httpStatus).toBe(401);
    expect(error.code).toBe('UNAUTHENTICATED');
  });

  it('RF-000-11: un rol desconocido no se trata como admin', () => {
    const request = {
      user: { id: 'u1', role: 'Admin' },
    } as unknown as Partial<AuthenticatedRequest>;

    const error = expectRejection(() => guard.canActivate(contextFor(request)));

    expect(error.httpStatus).toBe(403);
  });
});
