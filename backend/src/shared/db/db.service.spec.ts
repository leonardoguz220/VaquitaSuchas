import { jest } from '@jest/globals';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { DbModule } from './db.module.js';
import { DbService, type DbPool } from './db.service.js';

type QueryFn = (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;

interface FakeClient {
  query: jest.Mock<QueryFn>;
  release: jest.Mock<(destroy?: boolean) => void>;
}

interface FakePool {
  query: jest.Mock<QueryFn>;
  connect: jest.Mock<() => Promise<FakeClient>>;
  end: jest.Mock<() => Promise<void>>;
  on: jest.Mock<() => void>;
}

/** Responde `rows` a cada consulta salvo las que `failOn` marque para rechazar. */
function createFakeClient(
  failOn: Record<string, Error> = {},
  rowsByText: Record<string, unknown[]> = {},
): FakeClient {
  return {
    query: jest.fn<QueryFn>((text) => {
      const failure = failOn[text];
      return failure ? Promise.reject(failure) : Promise.resolve({ rows: rowsByText[text] ?? [] });
    }),
    release: jest.fn<(destroy?: boolean) => void>(),
  };
}

function createFakePool(client: FakeClient = createFakeClient()): FakePool {
  return {
    query: jest.fn<QueryFn>(() => Promise.resolve({ rows: [] })),
    connect: jest.fn(() => Promise.resolve(client)),
    end: jest.fn(() => Promise.resolve()),
    on: jest.fn(),
  };
}

function createService(pool: FakePool): DbService {
  return new DbService(pool as unknown as DbPool);
}

const queriesOf = (client: FakeClient): string[] => client.query.mock.calls.map(([text]) => text);

describe('DbService', () => {
  describe('query', () => {
    it('RF-000-14: ejecuta la consulta en el pool con sus parámetros', async () => {
      const pool = createFakePool();
      pool.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });

      const result = await createService(pool).query('SELECT $1::int AS id', [1]);

      expect(pool.query).toHaveBeenCalledWith('SELECT $1::int AS id', [1]);
      expect(result.rows).toEqual([{ id: 1 }]);
    });

    it('RF-000-14: relanza sin envolver el error de pg', async () => {
      const pool = createFakePool();
      const pgError = Object.assign(new Error('duplicate key'), { code: '23505' });
      pool.query.mockRejectedValueOnce(pgError);

      await expect(createService(pool).query('INSERT ...')).rejects.toBe(pgError);
    });
  });

  describe('withTransaction', () => {
    it('RF-000-14: hace BEGIN, ejecuta fn y COMMIT en el mismo cliente, y devuelve su resultado', async () => {
      const client = createFakeClient();
      const pool = createFakePool(client);

      const result = await createService(pool).withTransaction(async (tx) => {
        await tx.query('INSERT INTO t VALUES ($1)', [7]);
        return 'listo';
      });

      expect(result).toBe('listo');
      expect(queriesOf(client)).toEqual(['BEGIN', 'INSERT INTO t VALUES ($1)', 'COMMIT']);
      expect(client.query).toHaveBeenNthCalledWith(2, 'INSERT INTO t VALUES ($1)', [7]);
      expect(pool.query).not.toHaveBeenCalled();
      expect(client.release).toHaveBeenCalledTimes(1);
      expect(client.release).toHaveBeenCalledWith(false);
    });

    it('RF-000-14: hace ROLLBACK, relanza el mismo error y libera el cliente si fn falla', async () => {
      const client = createFakeClient();
      const pool = createFakePool(client);
      const failure = new Error('regla de negocio violada');

      await expect(
        createService(pool).withTransaction(async (tx) => {
          await tx.query('UPDATE t SET a = 1');
          throw failure;
        }),
      ).rejects.toBe(failure);

      expect(queriesOf(client)).toEqual(['BEGIN', 'UPDATE t SET a = 1', 'ROLLBACK']);
      expect(client.release).toHaveBeenCalledTimes(1);
      expect(client.release).toHaveBeenCalledWith(false);
    });

    it('RF-000-14: si una consulta de pg falla dentro de fn, relanza ese error sin envolver', async () => {
      const pgError = Object.assign(new Error('violates check'), { code: '23514' });
      const client = createFakeClient({ 'INSERT bad': pgError });

      await expect(
        createService(createFakePool(client)).withTransaction((tx) => tx.query('INSERT bad')),
      ).rejects.toBe(pgError);

      expect(queriesOf(client)).toEqual(['BEGIN', 'INSERT bad', 'ROLLBACK']);
    });

    it('RF-000-14: libera el cliente y relanza si falla BEGIN, sin ejecutar fn', async () => {
      const failure = new Error('begin falló');
      const client = createFakeClient({ BEGIN: failure });
      const fn = jest.fn(() => Promise.resolve('no debería ejecutarse'));

      await expect(createService(createFakePool(client)).withTransaction(fn)).rejects.toBe(failure);

      expect(fn).not.toHaveBeenCalled();
      expect(client.release).toHaveBeenCalledTimes(1);
    });

    it('RF-000-14: si falla COMMIT hace ROLLBACK, relanza el error y libera el cliente', async () => {
      const failure = new Error('commit falló');
      const client = createFakeClient({ COMMIT: failure });

      await expect(
        createService(createFakePool(client)).withTransaction(() => Promise.resolve(1)),
      ).rejects.toBe(failure);

      expect(queriesOf(client)).toEqual(['BEGIN', 'COMMIT', 'ROLLBACK']);
      expect(client.release).toHaveBeenCalledTimes(1);
    });

    it('RF-000-14: si también falla ROLLBACK relanza el error original y descarta la conexión', async () => {
      const original = new Error('fn falló');
      const client = createFakeClient({ ROLLBACK: new Error('conexión caída') });

      await expect(
        createService(createFakePool(client)).withTransaction(() => Promise.reject(original)),
      ).rejects.toBe(original);

      expect(client.release).toHaveBeenCalledTimes(1);
      expect(client.release).toHaveBeenCalledWith(true);
    });

    it('RF-000-14: no deja el cliente tomado si no se pudo obtener uno (no hay nada que liberar)', async () => {
      const failure = new Error('pool agotado');
      const pool = createFakePool();
      pool.connect.mockRejectedValueOnce(failure);

      await expect(createService(pool).withTransaction(() => Promise.resolve(1))).rejects.toBe(
        failure,
      );
    });

    it('RF-000-14: la transacción deja de aceptar consultas al terminar para no usar un cliente ya devuelto al pool', async () => {
      const client = createFakeClient();
      let leaked: { query: (text: string) => Promise<unknown> } | undefined;

      await createService(createFakePool(client)).withTransaction((tx) => {
        leaked = tx;
        return Promise.resolve();
      });

      await expect(leaked?.query('SELECT 1')).rejects.toThrow(/finalizó/);
      expect(queriesOf(client)).toEqual(['BEGIN', 'COMMIT']);
    });

    it('RF-000-14: dos transacciones usan clientes distintos (withTransaction no es anidable)', async () => {
      const first = createFakeClient();
      const second = createFakeClient();
      const pool = createFakePool();
      pool.connect.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
      const service = createService(pool);

      await service.withTransaction(() => service.withTransaction(() => Promise.resolve()));

      expect(queriesOf(first)).toEqual(['BEGIN', 'COMMIT']);
      expect(queriesOf(second)).toEqual(['BEGIN', 'COMMIT']);
    });
  });

  describe('tryAdvisoryLock', () => {
    const LOCK_SQL = 'SELECT pg_try_advisory_xact_lock(hashtext($1)) AS locked';

    it('RF-000-14: devuelve true cuando PostgreSQL concede el bloqueo y lo pide dentro de la transacción', async () => {
      const client = createFakeClient({}, { [LOCK_SQL]: [{ locked: true }] });
      const service = createService(createFakePool(client));

      const locked = await service.withTransaction((tx) =>
        service.tryAdvisoryLock(tx, 'example.noop'),
      );

      expect(locked).toBe(true);
      expect(client.query).toHaveBeenCalledWith(LOCK_SQL, ['example.noop']);
    });

    it('RF-000-14: devuelve false cuando otro proceso ya tiene el bloqueo', async () => {
      const client = createFakeClient({}, { [LOCK_SQL]: [{ locked: false }] });
      const service = createService(createFakePool(client));

      const locked = await service.withTransaction((tx) =>
        service.tryAdvisoryLock(tx, 'example.noop'),
      );

      expect(locked).toBe(false);
    });

    it('RF-000-14: sin fila de respuesta no concede el bloqueo', async () => {
      const client = createFakeClient();
      const service = createService(createFakePool(client));

      const locked = await service.withTransaction((tx) => service.tryAdvisoryLock(tx, 'x'));

      expect(locked).toBe(false);
    });
  });

  describe('withAdvisoryLock', () => {
    const LOCK_SQL = 'SELECT pg_try_advisory_lock(hashtext($1)) AS locked';
    const UNLOCK_SQL = 'SELECT pg_advisory_unlock(hashtext($1))';

    it('RF-000-14: con el bloqueo concedido ejecuta fn, lo libera en la misma conexión y devuelve el valor', async () => {
      const client = createFakeClient({}, { [LOCK_SQL]: [{ locked: true }] });
      const fn = jest.fn(() => Promise.resolve(3));

      const result = await createService(createFakePool(client)).withAdvisoryLock('job.a', fn);

      expect(result).toEqual({ acquired: true, value: 3 });
      expect(fn).toHaveBeenCalledTimes(1);
      expect(client.query).toHaveBeenNthCalledWith(1, LOCK_SQL, ['job.a']);
      expect(client.query).toHaveBeenNthCalledWith(2, UNLOCK_SQL, ['job.a']);
      expect(client.release).toHaveBeenCalledWith(false);
    });

    it('RF-000-14: si otro proceso tiene el bloqueo no ejecuta fn ni intenta liberar', async () => {
      const client = createFakeClient({}, { [LOCK_SQL]: [{ locked: false }] });
      const fn = jest.fn(() => Promise.resolve(3));

      const result = await createService(createFakePool(client)).withAdvisoryLock('job.a', fn);

      expect(result).toEqual({ acquired: false });
      expect(fn).not.toHaveBeenCalled();
      expect(queriesOf(client)).toEqual([LOCK_SQL]);
      expect(client.release).toHaveBeenCalledTimes(1);
    });

    it('RF-000-14: libera el bloqueo y relanza el mismo error si fn falla', async () => {
      const client = createFakeClient({}, { [LOCK_SQL]: [{ locked: true }] });
      const failure = new Error('job falló');

      await expect(
        createService(createFakePool(client)).withAdvisoryLock('job.a', () =>
          Promise.reject(failure),
        ),
      ).rejects.toBe(failure);

      expect(queriesOf(client)).toEqual([LOCK_SQL, UNLOCK_SQL]);
      expect(client.release).toHaveBeenCalledTimes(1);
    });

    it('RF-000-14: si falla la liberación descarta la conexión (así PostgreSQL suelta el bloqueo) y conserva el resultado de fn', async () => {
      const client = createFakeClient(
        { [UNLOCK_SQL]: new Error('conexión caída') },
        { [LOCK_SQL]: [{ locked: true }] },
      );

      const result = await createService(createFakePool(client)).withAdvisoryLock('job.a', () =>
        Promise.resolve('ok'),
      );

      expect(result).toEqual({ acquired: true, value: 'ok' });
      expect(client.release).toHaveBeenCalledWith(true);
    });

    it('RF-000-14: si falla la consulta del bloqueo relanza el error y libera el cliente', async () => {
      const failure = new Error('sin conexión');
      const client = createFakeClient({ [LOCK_SQL]: failure });

      await expect(
        createService(createFakePool(client)).withAdvisoryLock('job.a', () => Promise.resolve(1)),
      ).rejects.toBe(failure);

      expect(client.release).toHaveBeenCalledTimes(1);
    });
  });

  describe('ciclo de vida', () => {
    it('RF-000-14: onModuleDestroy cierra el pool', async () => {
      const pool = createFakePool();

      await createService(pool).onModuleDestroy();

      expect(pool.end).toHaveBeenCalledTimes(1);
    });

    it('RF-000-14: un error en un cliente inactivo del pool se captura y no tumba el proceso', () => {
      const pool = createFakePool();

      createService(pool);

      expect(pool.on).toHaveBeenCalledWith('error', expect.any(Function));
    });
  });

  describe('DbModule', () => {
    it('RF-000-14: crea el pool desde DATABASE_URL sin conectarse y lo cierra al destruir el módulo', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            isGlobal: true,
            ignoreEnvFile: true,
            load: [() => ({ DATABASE_URL: 'postgresql://app:app@localhost:1/vaquita_test' })],
          }),
          DbModule,
        ],
      }).compile();

      expect(moduleRef.get(DbService)).toBeInstanceOf(DbService);
      await expect(moduleRef.close()).resolves.toBeUndefined();
    });
  });
});
