import type { Request } from 'express';
import type { AuthenticatedUser, SessionClaims } from '../ports/auth-session.port.js';

/**
 * Petición después de `AuthGuard`. Se tipa por herencia y no con una ampliación global de
 * `express` para que solo el código que de verdad depende del guard vea estos campos.
 */
export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
  /** Claims ya verificados; los usa, por ejemplo, la renovación deslizante `X-Session-Token`. */
  sessionClaims?: SessionClaims;
}
