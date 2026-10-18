import { Inject, Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import type { PoolClient, QueryResult, QueryResultRow } from 'pg';
import { PG_POOL, type DbPool } from './pg-pool.js';

export type { DbPool } from './pg-pool.js';

/** Algo contra lo que se puede ejecutar SQL: el pool o una transacción abierta. */
export interface Queryable {
  query<R extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[],
  ): Promise<QueryResult<R>>;
}

/**
 * Transacción abierta por `DbService.withTransaction`. Los repositorios que deben participar en
 * ella reciben este objeto como parámetro. Deja de aceptar consultas cuando la transacción
 * termina, porque su cliente ya volvió al pool y lo estaría usando otra persona.
 */
export interface DbTransaction extends Queryable {
  readonly isTransaction: true;
}

export type AdvisoryLockResult<T> = { acquired: true; value: T } | { acquired: false };

class ClientTransaction implements DbTransaction {
  readonly isTransaction = true as const;
  private active = true;

  constructor(private readonly client: PoolClient) {}

  query<R extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[],
  ): Promise<QueryResult<R>> {
    if (!this.active) {
      throw new Error('La transacción ya finalizó: no se pueden ejecutar más consultas en ella.');
    }
    return this.client.query<R>(text, params);
  }

  finish(): void {
    this.active = false;
  }
}

// Conexiones: el SQL de negocio vive en los repositorios; aquí solo hay SQL de infraestructura
// (BEGIN/COMMIT/ROLLBACK y bloqueos asesores). Los parámetros de las consultas nunca se
// registran ni se incluyen en errores: pueden ser datos personales. Los errores de `pg` se
// relanzan tal cual para que el filtro de excepciones los traduzca.
@Injectable()
export class DbService implements OnModuleDestroy {
  private readonly logger = new Logger(DbService.name);

  constructor(@Inject(PG_POOL) private readonly pool: DbPool) {
    // Sin este manejador, un error de un cliente inactivo (p. ej. la base reinició) tumba el proceso.
    // Solo se registra el código: el mensaje de pg puede incluir host o usuario.
    this.pool.on('error', (error: Error & { code?: string }) => {
      this.logger.error(
        `Error en un cliente inactivo del pool de PostgreSQL (${error.code ?? 'sin código'}).`,
      );
    });
  }

  /** Consulta suelta con una conexión del pool, fuera de cualquier transacción. */
  query<R extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[],
  ): Promise<QueryResult<R>> {
    return this.pool.query<R>(text, params);
  }

  /**
   * Ejecuta `fn` dentro de una transacción en un cliente dedicado: COMMIT si termina bien,
   * ROLLBACK si falla (se relanza el error original) y siempre devuelve el cliente al pool.
   *
   * No hay transacciones anidadas ni savepoints: llamar de nuevo a `withTransaction` dentro de
   * `fn` abre OTRA transacción en otra conexión, independiente de la externa. Para participar
   * en la transacción actual hay que pasar el `tx` recibido hacia abajo. El pool necesita al
   * menos una conexión libre más por cada anidamiento, y dos transacciones que se esperan
   * entre sí se bloquean; por eso los servicios abren una sola por caso de uso.
   */
  async withTransaction<T>(fn: (tx: DbTransaction) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    const tx = new ClientTransaction(client);
    // Si ROLLBACK también falla la conexión queda en estado desconocido: se descarta.
    let discardClient = false;

    try {
      await client.query('BEGIN');
      const result = await fn(tx);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        discardClient = true;
      }
      throw error;
    } finally {
      tx.finish();
      client.release(discardClient);
    }
  }

  /**
   * Bloqueo asesor de transacción: `true` si lo obtuvo, `false` si otra transacción lo tiene.
   * Se libera solo al hacer COMMIT o ROLLBACK, así que no hay nada que soltar a mano. Úsalo para
   * serializar una sección corta que ya corre dentro de `withTransaction` (por ejemplo, evitar
   * que dos peticiones generen el mismo cobro). El tipo exige un `DbTransaction`: fuera de una
   * transacción el bloqueo se soltaría en cuanto termina la consulta.
   */
  async tryAdvisoryLock(tx: DbTransaction, name: string): Promise<boolean> {
    const result = await tx.query<{ locked: boolean }>(
      'SELECT pg_try_advisory_xact_lock(hashtext($1)) AS locked',
      [name],
    );
    return result.rows[0]?.locked === true;
  }

  /**
   * Bloqueo asesor de sesión para tareas largas (`JobRunner`, T028): ejecuta `fn` solo si obtiene
   * el bloqueo `name`; si otra instancia lo tiene devuelve `{ acquired: false }` sin ejecutarla.
   * Se usa en lugar del de transacción porque una tarea hace varias escrituras y no debe
   * mantener una sola transacción abierta todo ese tiempo. El bloqueo pertenece a la conexión,
   * así que se toma y se libera en el mismo cliente dedicado, y se suelta siempre en `finally`.
   * `fn` NO recibe esa conexión: usa el pool o sus propias transacciones.
   */
  async withAdvisoryLock<T>(name: string, fn: () => Promise<T>): Promise<AdvisoryLockResult<T>> {
    const client = await this.pool.connect();
    let discardClient = false;
    let held = false;

    try {
      const result = await client.query<{ locked: boolean }>(
        'SELECT pg_try_advisory_lock(hashtext($1)) AS locked',
        [name],
      );
      held = result.rows[0]?.locked === true;
      if (!held) {
        return { acquired: false };
      }
      return { acquired: true, value: await fn() };
    } finally {
      if (held) {
        try {
          await client.query('SELECT pg_advisory_unlock(hashtext($1))', [name]);
        } catch {
          // Al cerrar la conexión PostgreSQL suelta el bloqueo de sesión por su cuenta.
          discardClient = true;
        }
      }
      client.release(discardClient);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
