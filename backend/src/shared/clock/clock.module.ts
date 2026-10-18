import { Global, Module } from '@nestjs/common';
import { Clock } from './clock.js';
import { SystemClock } from './system-clock.js';

// Global para que cualquier servicio inyecte Clock sin importar este módulo.
// En pruebas se reemplaza con `.overrideProvider(Clock).useValue(new FakeClock(...))`.
@Global()
@Module({
  providers: [{ provide: Clock, useClass: SystemClock }],
  exports: [Clock],
})
export class ClockModule {}
