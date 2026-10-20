import { apiRequest } from './http';
import {
  excludeChargeReputation,
  getGroupRanking,
  getMyBadges,
  getMyReputation,
  reportChargeReputation,
} from './reputation';

jest.mock('./http', () => ({ apiRequest: jest.fn() }));

const mockedRequest = jest.mocked(apiRequest);
const GROUP_ID = '5b0d7c3e-0000-4000-8000-0000000000a1';
const CHARGE_ID = '5b0d7c3e-0000-4000-8000-0000000000c1';

function lastCall() {
  const call = mockedRequest.mock.calls.at(-1);
  if (!call) throw new Error('apiRequest no se llamó');
  return { path: call[0], options: call[1] ?? {} };
}

describe('services/reputation conectado al backend (contrato 007, T016, T022, T027, T033)', () => {
  beforeEach(() => {
    mockedRequest.mockReset();
    mockedRequest.mockResolvedValue({} as never);
  });

  it('CA-007-01: getMyReputation pide GET /api/users/me/reputation y devuelve la respuesta tal cual', async () => {
    const detail = { level: 'Nuevo', stars: null, starsLabel: null };
    mockedRequest.mockResolvedValueOnce(detail as never);
    await expect(getMyReputation()).resolves.toBe(detail);
    expect(lastCall()).toEqual({
      path: '/api/users/me/reputation',
      options: { signal: undefined },
    });
  });

  it('CA-007-08: getMyBadges pide GET /api/users/me/badges', async () => {
    const badges = { earned: [], pending: [] };
    mockedRequest.mockResolvedValueOnce(badges as never);
    await expect(getMyBadges()).resolves.toBe(badges);
    expect(lastCall().path).toBe('/api/users/me/badges');
  });

  it('CA-007-10: getGroupRanking pide GET /api/groups/:id/ranking y reenvía la cancelación', async () => {
    const controller = new AbortController();
    const ranking = { items: [], unranked: [] };
    mockedRequest.mockResolvedValueOnce(ranking as never);
    await expect(getGroupRanking(GROUP_ID, { signal: controller.signal })).resolves.toBe(ranking);
    expect(lastCall()).toEqual({
      path: `/api/groups/${GROUP_ID}/ranking`,
      options: { signal: controller.signal },
    });
  });

  it('CA-007-13: reportChargeReputation envía POST con el motivo como `comment`', async () => {
    const input = { comment: 'El cobro debería contar a mi favor.' };
    await reportChargeReputation(CHARGE_ID, input);
    expect(lastCall()).toEqual({
      path: `/api/charges/${CHARGE_ID}/reputation-report`,
      options: { method: 'POST', body: input },
    });
  });

  it('CA-007-13: excludeChargeReputation envía POST con el motivo como `reason`', async () => {
    const input = { reason: 'Cobro de prueba del grupo.' };
    await excludeChargeReputation(CHARGE_ID, input);
    expect(lastCall()).toEqual({
      path: `/api/charges/${CHARGE_ID}/reputation-exclusion`,
      options: { method: 'POST', body: input },
    });
  });
});
