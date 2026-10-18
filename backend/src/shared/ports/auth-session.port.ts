/** Valores de `users.role` (spec 003, data-model). */
export type UserRole = 'usuario' | 'admin';

/**
 * Claims que el `AuthGuard` ya verificó criptográficamente (firma HS256 y `exp`). Son los únicos
 * que el resto del sistema debe leer del JWT (spec 003, plan: `sub`, `sv`, `iat`, `exp`).
 */
export interface SessionClaims {
  /** Identificador del usuario (UUID). */
  readonly sub: string;
  /** `session_version` con la que se emitió el token. */
  readonly sv: number;
  /** Instante de emisión, en segundos Unix. */
  readonly iat: number;
  /** Instante de vencimiento, en segundos Unix. */
  readonly exp: number;
}

/** Datos mínimos que los guards y los controladores necesitan de la persona autenticada. */
export interface AuthenticatedUser {
  readonly id: string;
  readonly role: UserRole;
}

/**
 * Puerto que resuelve el estado actual de una sesión. El `AuthGuard` (shared) no conoce la tabla
 * `users`: la spec 003 implementa este puerto con un adaptador que consulta la base.
 *
 * Contrato: devuelve el usuario SOLO si existe, su `session_version` es igual a `claims.sv`,
 * su estado es `activo` y está verificado (`verified_at` no nulo). En cualquier otro caso devuelve
 * `null` (el guard responde 401 sin distinguir el motivo). Si no puede consultar (base caída)
 * lanza: el guard no lo convierte en 401, el filtro global responde 500.
 */
export interface AuthSessionPort {
  resolveSession(claims: SessionClaims): Promise<AuthenticatedUser | null>;
}

/** Token de inyección del puerto; quien lo implemente lo registra con `provide: AUTH_SESSION_PORT`. */
export const AUTH_SESSION_PORT = Symbol('AUTH_SESSION_PORT');
