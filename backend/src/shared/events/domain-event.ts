import type { DbTransaction } from '../db/db.service.js';

/**
 * Forma mínima de un evento de dominio. Vive en `shared/events` y no importa NestJS, para que un
 * módulo pueda declarar y reaccionar a un evento sin importar a otro módulo solo por su tipo.
 * `type` es un literal único por evento y con espacio de nombres (p. ej. `'subscriptions.group-created'`).
 * Los datos del evento deben ser serializables y no llevar conexiones ni servicios.
 */
export interface DomainEvent {
  readonly type: string;
}

/**
 * Manejador de un evento. Recibe la MISMA transacción en la que se publicó, así que sus escrituras
 * se confirman o se revierten junto con el hecho que las originó. Si lanza o rechaza, la
 * transacción completa se revierte.
 */
export type TxEventHandler<E extends DomainEvent = DomainEvent> = (
  tx: DbTransaction,
  event: E,
) => Promise<void> | void;
