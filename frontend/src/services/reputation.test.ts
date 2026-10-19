import { apiRequest } from './http';
import {
  excludeChargeFromReputation,
  getGroupRanking,
  getMyBadges,
  getMyReputation,
  reportChargeRating,
} from './reputation';

jest.mock('./http', () => ({
  ...jest.requireActual('./http'),
  apiRequest: jest.fn(),
}));

const mockedRequest = jest.mocked(apiRequest);

beforeEach(() => mockedRequest.mockReset());

describe('services/reputation (contrato 007)', () => {
  it('RF-007-04: getMyReputation hace GET /api/users/me/reputation sin enviar datos', async () => {
    mockedRequest.mockResolvedValue({});
    await getMyReputation();
    expect(mockedRequest).toHaveBeenCalledWith('/api/users/me/reputation');
  });

  it('RF-007-07: getMyBadges hace GET /api/users/me/badges', async () => {
    mockedRequest.mockResolvedValue({ earned: [], pending: [] });
    await getMyBadges();
    expect(mockedRequest).toHaveBeenCalledWith('/api/users/me/badges');
  });

  it('RF-007-09: getGroupRanking hace GET /api/groups/:id/ranking con el id codificado', async () => {
    mockedRequest.mockResolvedValue({ items: [], unranked: [] });
    await getGroupRanking('g/2');
    expect(mockedRequest).toHaveBeenCalledWith('/api/groups/g%2F2/ranking');
  });

  it('RF-007-14: reportChargeRating hace POST /api/charges/:id/reputation-report con el comentario', async () => {
    mockedRequest.mockResolvedValue(undefined);
    await reportChargeRating('c/1', { comment: 'Pagué antes del vencimiento.' });
    expect(mockedRequest).toHaveBeenCalledWith('/api/charges/c%2F1/reputation-report', {
      method: 'POST',
      body: { comment: 'Pagué antes del vencimiento.' },
    });
  });

  it('CA-007-13: excludeChargeFromReputation hace POST /api/charges/:id/reputation-exclusion con el motivo', async () => {
    mockedRequest.mockResolvedValue(undefined);
    await excludeChargeFromReputation('c1', { reason: 'Error del banco al acreditar.' });
    expect(mockedRequest).toHaveBeenCalledWith('/api/charges/c1/reputation-exclusion', {
      method: 'POST',
      body: { reason: 'Error del banco al acreditar.' },
    });
  });
});
