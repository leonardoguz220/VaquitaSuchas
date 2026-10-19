import { Global, Module } from '@nestjs/common';
import { TxEventBus } from './tx-event-bus.js';

// Global para que cualquier módulo inyecte TxEventBus sin importar este módulo. Un único bus por
// aplicación: los manejadores de todos los módulos se registran en la misma instancia.
@Global()
@Module({
  providers: [TxEventBus],
  exports: [TxEventBus],
})
export class EventsModule {}
