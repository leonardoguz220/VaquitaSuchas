import { Module } from '@nestjs/common';
import { JobsTickController } from './jobs-tick.controller.js';

// Parte HTTP de las tareas programadas (RF-000-14). Separada de `JobsModule` para que quien solo
// necesita el runner (otros módulos, pruebas) no cargue guards que exigen `JOBS_TOKEN`.
// `JobRunner` llega del `JobsModule` global; ConfigService y Clock, de sus módulos globales.
// Los guards del controlador los instancia Nest una sola vez en este módulo, por lo que el
// estado de `TickRateLimitGuard` (último tick aceptado) es único para toda la aplicación.
@Module({ controllers: [JobsTickController] })
export class JobsHttpModule {}
