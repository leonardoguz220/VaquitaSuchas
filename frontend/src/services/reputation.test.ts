import { apiRequest } from './http';
import { getGroupRanking, getMyBadges, getMyReputation } from './reputation';

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
});
