import { Clock } from './clock.js';

// Instante fijo por omisión: el reloj falso nunca debe leer el reloj real.
const DEFAULT_START = '2026-01-01T00:00:00.000Z';

/** Reloj controlado para pruebas de plazos sin esperas. No es un proveedor de la aplicación. */
export class FakeClock extends Clock {
  private current: number;

  constructor(start: Date | string | number = DEFAULT_START) {
    super();
    const time = new Date(start).getTime();
    if (Number.isNaN(time)) {
      throw new RangeError('FakeClock: el instante inicial no es una fecha válida.');
    }
    this.current = time;
  }

  now(): Date {
    return new Date(this.current);
  }

  /** Adelanta el reloj `ms` milisegundos. El tiempo no retrocede: `ms` debe ser finito y >= 0. */
  advance(ms: number): void {
    if (!Number.isFinite(ms) || ms < 0) {
      throw new RangeError('FakeClock.advance: ms debe ser un número finito mayor o igual a 0.');
    }
    this.current += ms;
  }
}
