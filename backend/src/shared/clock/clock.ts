/**
 * Fuente del instante actual para los servicios (RN-000-01: siempre UTC internamente).
 *
 * Es una clase abstracta y no una interfaz con token porque en NestJS la clase hace de token
 * de inyección y de tipo a la vez, y sobrevive a `emitDecoratorMetadata`.
 * Las funciones de dominio NO la reciben: los servicios llaman a `now()` y pasan el `Date`.
 */
export abstract class Clock {
  /** Instante actual. Cada llamada devuelve un `Date` nuevo que el llamador puede modificar. */
  abstract now(): Date;
}
