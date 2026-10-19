import { apiRequest } from './http';
import {
  createGroupListing,
  getGroupListing,
  isOwnerListing,
  renewGroupListing,
  updateGroupListing,
  withdrawGroupListing,
} from './listings';

jest.mock('./http', () => ({
  ...jest.requireActual('./http'),
  apiRequest: jest.fn(),
}));

const mockedRequest = jest.mocked(apiRequest);

beforeEach(() => mockedRequest.mockReset());

describe('services/listings (contrato 008): publicación del titular', () => {
  it('RF-008-01: getGroupListing hace GET /api/groups/:id/listing con el id codificado', async () => {
    mockedRequest.mockResolvedValue(null);
    await getGroupListing('g/1');
    expect(mockedRequest).toHaveBeenCalledWith('/api/groups/g%2F1/listing');
  });

  it('RF-008-01: createGroupListing hace POST con cupos y textos', async () => {
    mockedRequest.mockResolvedValue({});
    await createGroupListing('g1', { slotsOffered: 2, description: 'Hola' });
    expect(mockedRequest).toHaveBeenCalledWith('/api/groups/g1/listing', {
      method: 'POST',
      body: { slotsOffered: 2, description: 'Hola' },
    });
  });

  it('RF-008-06: updateGroupListing hace PATCH con la versión', async () => {
    mockedRequest.mockResolvedValue({});
    await updateGroupListing('g1', { slotsOffered: 1, version: 4 });
    expect(mockedRequest).toHaveBeenCalledWith('/api/groups/g1/listing', {
      method: 'PATCH',
      body: { slotsOffered: 1, version: 4 },
    });
  });

  it('RF-008-05: renewGroupListing hace POST /renew', async () => {
    mockedRequest.mockResolvedValue({});
    await renewGroupListing('g1');
    expect(mockedRequest).toHaveBeenCalledWith('/api/groups/g1/listing/renew', { method: 'POST' });
  });

  it('RF-008-06: withdrawGroupListing hace DELETE', async () => {
    mockedRequest.mockResolvedValue(undefined);
    await withdrawGroupListing('g1');
    expect(mockedRequest).toHaveBeenCalledWith('/api/groups/g1/listing', { method: 'DELETE' });
  });

  it('RF-008-01: isOwnerListing distingue la vista del titular del resumen del miembro', () => {
    expect(isOwnerListing(null)).toBe(false);
    expect(isOwnerListing({ active: true, slotsOffered: 2, expiresAt: null })).toBe(false);
    expect(isOwnerListing({ status: 'activa' } as Parameters<typeof isOwnerListing>[0])).toBe(true);
  });
});
