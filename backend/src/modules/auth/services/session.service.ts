import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Clock } from '../../../shared/clock/clock.js';
import { signHs256Jwt } from '../../../shared/guards/jwt-hs256.js';
import type { SessionClaims } from '../../../shared/ports/auth-session.port.js';
import { buildSessionClaims, shouldRenewSession } from '../domain/session-token.js';

@Injectable()
export class SessionService {
  private readonly secret: string;

  constructor(
    config: ConfigService,
    private readonly clock: Clock,
  ) {
    this.secret = config.getOrThrow<string>('JWT_SECRET');
  }

  /** Firma el JWT HS256 de sesión (`sub`, `sv`, `iat`, `exp` a 7 días). */
  issue(user: { id: string; sessionVersion: number }): string {
    const nowSec = Math.floor(this.clock.now().getTime() / 1000);
    return signHs256Jwt(
      { ...buildSessionClaims(user.id, user.sessionVersion, nowSec) },
      this.secret,
    );
  }

  /** Token nuevo si al actual le quedan menos de 6 días; null si no hace falta. */
  renewIfNeeded(claims: SessionClaims): string | null {
    const nowSec = Math.floor(this.clock.now().getTime() / 1000);
    if (!shouldRenewSession(claims.exp, nowSec)) return null;
    return this.issue({ id: claims.sub, sessionVersion: claims.sv });
  }
}
