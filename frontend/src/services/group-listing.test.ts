import { apiRequest } from './http';
import {
  createOwnerListing,
  getGroupListingSummary,
  getOwnerListing,
  renewOwnerListing,
  retireOwnerListing,
  updateOwnerListing,
} from './group-listing';

jest.mock('./http', () => ({ apiRequest: jest.fn() }));

const mockedRequest = jest.mocked(apiRequest);
const GROUP_ID = '5b0d7c3e-0000-4000-8000-0000000000a1';
const PATH = `/api/groups/${GROUP_ID}/listing`;

function lastCall() {
  const call = mockedRequest.mock.calls.at(-1);
  if (!call) throw new Error('apiRequest no se llamó');
  return { path: call[0], options: call[1] ?? {} };
}

describe('services/group-listing conectado al backend (contrato 008, T012)', () => {
  beforeEach(() => {
    mockedRequest.mockReset();
    mockedRequest.mockResolvedValue({} as never);
  });

  it('RF-008-01: getOwnerListing pide GET /api/groups/:id/listing', async () => {
    mockedRequest.mockResolvedValueOnce(null as never);
    await expect(getOwnerListing(GROUP_ID)).resolves.toBeNull();
    expect(lastCall()).toEqual({ path: PATH, options: { signal: undefined } });
  });

  it('getGroupListingSummary pide la misma ruta para el miembro', async () => {
    await getGroupListingSummary(GROUP_ID);
    expect(lastCall().path).toBe(PATH);
  });

  it('CA-008-01: createOwnerListing envía POST con la cantidad y los textos', async () => {
    const input = { slotsOffered: 2, description: null, conditions: 'Sin cambios' };
    await createOwnerListing(GROUP_ID, input);
    expect(lastCall()).toEqual({ path: PATH, options: { method: 'POST', body: input } });
  });

  it('RF-008-06: updateOwnerListing envía PATCH solo con los campos que cambian', async () => {
    await updateOwnerListing(GROUP_ID, { slotsOffered: 1, version: 3 });
    expect(lastCall()).toEqual({
      path: PATH,
      options: { method: 'PATCH', body: { slotsOffered: 1, version: 3 } },
    });
  });

  it('RF-008-05: renewOwnerListing envía POST a /renew', async () => {
    await renewOwnerListing(GROUP_ID);
    expect(lastCall()).toEqual({ path: `${PATH}/renew`, options: { method: 'POST' } });
  });

  it('RF-008-06: retireOwnerListing envía DELETE a la publicación', async () => {
    await retireOwnerListing(GROUP_ID);
    expect(lastCall()).toEqual({ path: PATH, options: { method: 'DELETE' } });
  });
});
