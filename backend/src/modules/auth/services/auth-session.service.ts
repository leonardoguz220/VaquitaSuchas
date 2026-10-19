import { Injectable } from '@nestjs/common';
import type {
  AuthenticatedUser,
  AuthSessionPort,
  SessionClaims,
} from '../../../shared/ports/auth-session.port.js';
import { AuthSessionRepository } from '../repositories/auth-session.repository.js';

/** Implementa `AuthSessionPort` para `AuthGuard` (CA-003-18, CA-003-33). */
@Injectable()
export class AuthSessionService implements AuthSessionPort {
  constructor(private readonly repository: AuthSessionRepository) {}

  async resolveSession(claims: SessionClaims): Promise<AuthenticatedUser | null> {
    return this.repository.findActiveByVersion(claims.sub, claims.sv);
  }
}
