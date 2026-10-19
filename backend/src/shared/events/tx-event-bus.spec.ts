import { jest } from '@jest/globals';
import { Injectable, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DbService, type DbPool, type DbTransaction } from '../db/db.service.js';
import type { DomainEvent, TxEventHandler } from './domain-event.js';
import { EventsModule } from './events.module.js';
import { TxEventBus } from './tx-event-bus.js';

interface GroupCreated extends DomainEvent {
  readonly type: 'test.group-created';
  readonly groupId: string;
}

interface GroupClosed extends DomainEvent {
  readonly type: 'test.group-closed';
}

const groupCreated: GroupCreated = { type: 'test.group-created', groupId: 'g-1' };

const fakeTx = (): DbTransaction => ({
  isTransaction: true,
  query: jest.fn(() => Promise.resolve({ rows: [] })) as unknown as DbTransaction['query'],
});

type QueryFn = (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;

function createFakeDb(): { db: DbService; queries: string[]; release: jest.Mock } {
  const queries: string[] = [];
  const release = jest.fn();
  const client = {
    query: jest.fn<QueryFn>((text) => {
      queries.push(text);
      return Promise.resolve({ rows: [] });
    }),
    release,
  };
  const pool = {
    query: jest.fn(),
    connect: jest.fn(() => Promise.resolve(client)),
    end: jest.fn(() => Promise.resolve()),
    on: jest.fn(),
  };
  return { db: new DbService(pool as unknown as DbPool), queries, release };
}

describe('TxEventBus', () => {
  describe('publish', () => {
    it('RF-000-14: ejecuta los manejadores del tipo en orden de registro y con el mismo tx', async () => {
      const bus = new TxEventBus();
      const tx = fakeTx();
      const calls: string[] = [];
      const seen: DbTransaction[] = [];
      bus.register<GroupCreated>('test.group-created', (received, event) => {
        calls.push(`a:${event.groupId}`);
        seen.push(received);
      });
      bus.register<GroupCreated>('test.group-created', (received) => {
        calls.push('b');
        seen.push(received);
      });

      await bus.publish(tx, groupCreated);

      expect(calls).toEqual(['a:g-1', 'b']);
      expect(seen).toEqual([tx, tx]);
      expect(seen[0]).toBe(tx);
      expect(seen[1]).toBe(tx);
    });

    it('RF-000-14: entrega el mismo objeto de evento a cada manejador', async () => {
      const bus = new TxEventBus();
      const received: DomainEvent[] = [];
      bus.register<GroupCreated>('test.group-created', (_tx, event) => void received.push(event));
      bus.register<GroupCreated>('test.group-created', (_tx, event) => void received.push(event));

      await bus.publish(fakeTx(), groupCreated);

      expect(received[0]).toBe(groupCreated);
      expect(received[1]).toBe(groupCreated);
    });

    it('RF-000-14: un evento sin manejadores es válido y no hace nada', async () => {
      const bus = new TxEventBus();
      const tx = fakeTx();

      await expect(bus.publish(tx, groupCreated)).resolves.toBeUndefined();

      expect(tx.query).not.toHaveBeenCalled();
    });

    it('RF-000-14: no ejecuta manejadores registrados para otros tipos de evento', async () => {
      const bus = new TxEventBus();
      const other = jest.fn<TxEventHandler>();
      const own = jest.fn<TxEventHandler>();
      bus.register<GroupClosed>('test.group-closed', other);
      bus.register<GroupCreated>('test.group-created', own);

      await bus.publish(fakeTx(), groupCreated);

      expect(own).toHaveBeenCalledTimes(1);
      expect(other).not.toHaveBeenCalled();
    });

    it('RF-000-14: espera a un manejador asíncrono antes de ejecutar el siguiente', async () => {
      const bus = new TxEventBus();
      const order: string[] = [];
      bus.register<GroupCreated>('test.group-created', async () => {
        order.push('a:inicio');
        await new Promise((resolve) => setTimeout(resolve, 20));
        order.push('a:fin');
      });
      bus.register<GroupCreated>('test.group-created', () => {
        order.push('b');
      });

      await bus.publish(fakeTx(), groupCreated);

      expect(order).toEqual(['a:inicio', 'a:fin', 'b']);
    });

    it('RF-000-14: un manejador que falla propaga el MISMO error y no ejecuta los siguientes', async () => {
      const bus = new TxEventBus();
      const failure = new Error('regla violada');
      const first = jest.fn<TxEventHandler>();
      const after = jest.fn<TxEventHandler>();
      bus.register<GroupCreated>('test.group-created', first);
      bus.register<GroupCreated>('test.group-created', () => Promise.reject(failure));
      bus.register<GroupCreated>('test.group-created', after);

      await expect(bus.publish(fakeTx(), groupCreated)).rejects.toBe(failure);

      expect(first).toHaveBeenCalledTimes(1);
      expect(after).not.toHaveBeenCalled();
    });

    it('RF-000-14: un manejador síncrono que lanza también se propaga sin envolver', async () => {
      const bus = new TxEventBus();
      const failure = Object.assign(new Error('check'), { code: '23514' });
      bus.register<GroupCreated>('test.group-created', () => {
        throw failure;
      });

      await expect(bus.publish(fakeTx(), groupCreated)).rejects.toBe(failure);
    });

    it('RF-000-14: un manejador puede publicar otro evento dentro de la misma transacción', async () => {
      const bus = new TxEventBus();
      const tx = fakeTx();
      const inner = jest.fn<TxEventHandler>();
      bus.register<GroupClosed>('test.group-closed', inner);
      bus.register<GroupCreated>('test.group-created', (received) =>
        bus.publish(received, { type: 'test.group-closed' }),
      );

      await bus.publish(tx, groupCreated);

      expect(inner).toHaveBeenCalledWith(tx, { type: 'test.group-closed' });
    });

    it('RF-000-14: un registro hecho durante la publicación no altera la cadena en curso', async () => {
      const bus = new TxEventBus();
      const late = jest.fn<TxEventHandler>();
      bus.register<GroupCreated>('test.group-created', () => {
        bus.register<GroupCreated>('test.group-created', late);
      });

      await bus.publish(fakeTx(), groupCreated);

      expect(late).not.toHaveBeenCalled();
    });

    it('RF-000-14: rechaza publicar con algo que no es una transacción', async () => {
      const bus = new TxEventBus();
      const handler = jest.fn<TxEventHandler>();
      bus.register<GroupCreated>('test.group-created', handler);
      const notATx = { query: jest.fn() } as unknown as DbTransaction;

      await expect(bus.publish(notATx, groupCreated)).rejects.toThrow(/dentro de una transacción/);

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('register', () => {
    it('RF-000-14: registrar dos veces el mismo manejador para un tipo lanza y no lo duplica', async () => {
      const bus = new TxEventBus();
      const handler = jest.fn<TxEventHandler>();
      bus.register<GroupCreated>('test.group-created', handler);

      expect(() => bus.register<GroupCreated>('test.group-created', handler)).toThrow(
        /ya está registrado/,
      );

      await bus.publish(fakeTx(), groupCreated);
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('RF-000-14: el mismo manejador sí puede registrarse para tipos distintos y corre con cada uno', async () => {
      const bus = new TxEventBus();
      const handler = jest.fn<TxEventHandler>();
      const tx = fakeTx();

      bus.register('test.group-created', handler);
      expect(() => bus.register('test.group-closed', handler)).not.toThrow();

      await bus.publish(tx, groupCreated);
      await bus.publish(tx, { type: 'test.group-closed' });

      expect(handler).toHaveBeenCalledTimes(2);
      expect(handler).toHaveBeenNthCalledWith(1, tx, groupCreated);
      expect(handler).toHaveBeenNthCalledWith(2, tx, { type: 'test.group-closed' });
    });
  });

  describe('con DbService.withTransaction', () => {
    it('RF-000-14: un manejador que falla revierte el hecho (BEGIN, INSERT, ROLLBACK) y relanza el error original', async () => {
      const { db, queries, release } = createFakeDb();
      const bus = new TxEventBus();
      const failure = new Error('el manejador falló');
      bus.register<GroupCreated>('test.group-created', (tx) =>
        tx.query('INSERT INTO billing_cycles VALUES (1)').then(() => undefined),
      );
      bus.register<GroupCreated>('test.group-created', () => Promise.reject(failure));

      await expect(
        db.withTransaction(async (tx) => {
          await tx.query('INSERT INTO groups VALUES (1)');
          await bus.publish(tx, groupCreated);
        }),
      ).rejects.toBe(failure);

      expect(queries).toEqual([
        'BEGIN',
        'INSERT INTO groups VALUES (1)',
        'INSERT INTO billing_cycles VALUES (1)',
        'ROLLBACK',
      ]);
      expect(release).toHaveBeenCalledWith(false);
    });

    it('RF-000-14: si todos los manejadores pasan, el hecho y sus reacciones se confirman con un solo COMMIT', async () => {
      const { db, queries } = createFakeDb();
      const bus = new TxEventBus();
      bus.register<GroupCreated>('test.group-created', (tx) =>
        tx.query('INSERT INTO billing_cycles VALUES (1)').then(() => undefined),
      );

      await db.withTransaction(async (tx) => {
        await tx.query('INSERT INTO groups VALUES (1)');
        await bus.publish(tx, groupCreated);
      });

      expect(queries).toEqual([
        'BEGIN',
        'INSERT INTO groups VALUES (1)',
        'INSERT INTO billing_cycles VALUES (1)',
        'COMMIT',
      ]);
    });
  });

  describe('EventsModule', () => {
    @Injectable()
    class Consumer {
      constructor(readonly bus: TxEventBus) {}
    }

    // Módulo aparte que NO importa EventsModule: solo puede inyectar el bus si EventsModule es global.
    @Module({ providers: [Consumer] })
    class ConsumerModule {}

    it('RF-000-14: provee una única instancia global de TxEventBus inyectable sin importar el módulo', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [EventsModule, ConsumerModule],
      }).compile();

      const consumer = moduleRef.get(Consumer, { strict: false });
      expect(consumer.bus).toBe(moduleRef.get(TxEventBus));
      expect(moduleRef.get(TxEventBus)).toBeInstanceOf(TxEventBus);
    });
  });
});
