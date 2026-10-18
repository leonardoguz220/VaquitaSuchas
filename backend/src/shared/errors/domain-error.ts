/**
 * Error esperado de negocio (RF-000-11). Los servicios y el dominio lo lanzan con el código
 * estable de `contracts/api.md` A.3 y el filtro global lo traduce tal cual al formato A.2.
 *
 * No depende de NestJS a propósito: el dominio puede lanzarlo sin conocer el framework.
 * `message` y `details` llegan al cliente, así que quien lanza no debe poner en ellos trazas,
 * SQL ni datos personales.
 */
export class DomainError extends Error {
  constructor(
    /** Texto estable en inglés `SCREAMING_SNAKE_CASE`; el frontend decide la UX por él. */
    readonly code: string,
    readonly httpStatus: number,
    /** Mensaje para la persona usuaria, en español (Bolivia). */
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}
