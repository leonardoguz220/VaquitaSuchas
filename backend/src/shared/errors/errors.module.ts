import { Logger, Module } from '@nestjs/common';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { AllExceptionsFilter } from './all-exceptions.filter.js';
import { createValidationPipe } from './validation.js';

/**
 * Registra el filtro de errores y el `ValidationPipe` como globales con `APP_FILTER` y
 * `APP_PIPE` en vez de `app.useGlobalFilters` en `main.ts`: así aplican a cualquier aplicación
 * que importe este módulo (el arranque real y los e2e con `Test.createTestingModule`) sin
 * depender de que cada uno repita la configuración.
 */
@Module({
  providers: [
    {
      provide: APP_FILTER,
      useFactory: () => new AllExceptionsFilter(new Logger(AllExceptionsFilter.name)),
    },
    { provide: APP_PIPE, useFactory: createValidationPipe },
  ],
})
export class ErrorsModule {}
