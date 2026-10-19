import { apiRequest } from './http';
import { getMyReputation } from './reputation';

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
});
