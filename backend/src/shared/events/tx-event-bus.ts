import type { DbTransaction } from '../db/db.service.js';
import type { DomainEvent, TxEventHandler } from './domain-event.js';

/**
 * Bus de eventos transaccional (RF-000-14, spec 001 `research.md` R3). NO es un bus de mensajes:
 * no es asíncrono, no persiste ni reintenta. `publish` es una llamada síncrona (en sentido
 * lógico: se espera cada manejador) que ocurre DENTRO de la transacción del hecho, de modo que
 * el evento forma parte de él: si un manejador falla, el error llega intacto a `withTransaction`
 * y esta hace ROLLBACK de todo, incluido lo que ya escribieron los manejadores anteriores.
 *
 * Reglas:
 * - Los manejadores de un tipo corren EN SERIE y en orden de registro: comparten la conexión de
 *   la transacción y una conexión no ejecuta consultas en paralelo.
 * - El primer error corta la cadena (los siguientes no corren) y se relanza SIN envolver.
 * - Publicar un evento sin manejadores es válido y no hace nada.
 * - Registrar dos veces el mismo manejador para el mismo tipo es un error de programación y
 *   lanza al registrar: de aceptarlo, sus efectos se aplicarían dos veces sin que nadie lo note.
 * - Un manejador puede publicar otro evento con el mismo `tx`; evitar ciclos es cosa del autor.
 * - Los manejadores se registran al arrancar (p. ej. en `onModuleInit` del módulo que reacciona).
 *   Quien reacciona depende del tipo de evento de `shared/events`, nunca del módulo que lo emite.
 *
 * Esta clase no usa decoradores a propósito: no tiene dependencias, así que Nest la instancia
 * como proveedor de clase (ver `EventsModule`) y la lógica sigue libre del framework.
 */
export class TxEventBus {
  private readonly handlers = new Map<string, TxEventHandler[]>();

  register<E extends DomainEvent>(eventType: E['type'], handler: TxEventHandler<E>): void {
    const registered = this.handlers.get(eventType) ?? [];
    // El bus guarda `TxEventHandler<DomainEvent>`; `publish` solo entrega eventos de `eventType`.
    const generic = handler as unknown as TxEventHandler;
    if (registered.includes(generic)) {
      throw new Error(`El manejador ya está registrado para el evento "${eventType}".`);
    }
    this.handlers.set(eventType, [...registered, generic]);
  }

  /**
   * Ejecuta los manejadores del evento dentro de `tx`. Solo se debe llamar desde el cuerpo de
   * `DbService.withTransaction`; el tipo `DbTransaction` lo exige y se comprueba en ejecución.
   */
  async publish(tx: DbTransaction, event: DomainEvent): Promise<void> {
    if (tx.isTransaction !== true) {
      throw new Error('TxEventBus.publish solo se puede usar dentro de una transacción.');
    }
    // Copia: un registro tardío durante la publicación no cambia la cadena en curso.
    for (const handler of [...(this.handlers.get(event.type) ?? [])]) {
      await handler(tx, event);
    }
  }
}
