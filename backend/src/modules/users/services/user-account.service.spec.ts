import { jest } from '@jest/globals';
import type { DbTransaction } from '../../../shared/db/db.service.js';
import { TxEventBus } from '../../../shared/events/tx-event-bus.js';
import type { DomainEvent } from '../../../shared/events/domain-event.js';
import { UsersAccountRepository } from '../repositories/users-account.repository.js';
import { UserAccountService } from './user-account.service.js';

type QueryFn = (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;

function setup(rows: unknown[] = [{ session_version: 3 }]) {
  const query = jest.fn<QueryFn>(() => Promise.resolve({ rows }));
  const tx = { isTransaction: true, query } as unknown as DbTransaction;
  const bus = new TxEventBus();
  const published: DomainEvent[] = [];
  for (const type of ['users.suspended', 'users.reactivated', 'users.banned']) {
    bus.register(type, (_tx, event) => {
      published.push(event);
    });
  }
  const service = new UserAccountService(new UsersAccountRepository(), bus);
  return { service, tx, query, published };
}

describe('UserAccountService', () => {
  it('CA-003-18: suspender escribe el estado, sube session_version y publica UserSuspended', async () => {
    const { service, tx, query, published } = setup();
    await service.setStatus(tx, 'u-1', 'suspendido');
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('session_version = session_version + 1');
    expect(sql).toContain('RETURNING session_version');
    expect(params).toEqual(['u-1', 'suspendido']);
    expect(published).toEqual([{ type: 'users.suspended', userId: 'u-1' }]);
  });

  it('CA-003-23: banear publica UserBanned', async () => {
    const { service, tx, published } = setup();
    await service.setStatus(tx, 'u-1', 'baneado');
    expect(published).toEqual([{ type: 'users.banned', userId: 'u-1' }]);
  });

  it('CA-003-18: reactivar publica UserReactivated', async () => {
    const { service, tx, published } = setup();
    await service.setStatus(tx, 'u-1', 'activo');
    expect(published).toEqual([{ type: 'users.reactivated', userId: 'u-1' }]);
  });

  it('CA-003-33: cambiar el estado de un usuario inexistente responde 404 y no publica', async () => {
    const { service, tx, published } = setup([]);
    await expect(service.setStatus(tx, 'x', 'baneado')).rejects.toMatchObject({ httpStatus: 404 });
    expect(published).toEqual([]);
  });

  it('CA-003-33: setRole también sube session_version', async () => {
    const { service, tx, query } = setup();
    await service.setRole(tx, 'u-1', 'admin');
    expect(query.mock.calls[0][0]).toContain('session_version = session_version + 1');
    expect(query.mock.calls[0][1]).toEqual(['u-1', 'admin']);
  });
});
