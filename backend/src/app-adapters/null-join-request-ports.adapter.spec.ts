import type { Queryable } from '../shared/db/db.service.js';
import {
  NullAuditAdapter,
  NullBanAdapter,
  NullReputationAdapter,
} from './null-join-request-ports.adapter.js';

describe('adaptadores nulos de la spec 010 (hasta las specs 007 y 009)', () => {
  it('ReputationQueryPort: todas las personas aparecen «Sin calificación»', async () => {
    const result = await new NullReputationAdapter().getMany({} as Queryable, ['a', 'b']);
    expect(result.get('a')).toEqual({ stars: null, level: null });
    expect(result.get('b')).toEqual({ stars: null, level: null });
  });

  it('BanPort y AuditPort no hacen nada y no fallan', async () => {
    await expect(new NullBanAdapter().ban()).resolves.toBeNull();
    await expect(new NullAuditAdapter().record()).resolves.toBeUndefined();
  });
});
