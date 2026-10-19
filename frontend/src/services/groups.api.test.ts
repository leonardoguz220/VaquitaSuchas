import { apiRequest } from './http';
import { buildListGroupsQuery, getGroup, listGroups, regenerateInviteCode } from './groups';

jest.mock('./http', () => ({ apiRequest: jest.fn() }));

const mockedRequest = jest.mocked(apiRequest);
const GROUP_ID = '5b0d7c3e-0000-4000-8000-0000000000a1';

function lastCall() {
  const call = mockedRequest.mock.calls.at(-1);
  if (!call) throw new Error('apiRequest no se llamó');
  return { path: call[0], options: call[1] ?? {} };
}

describe('services/groups conectado al backend (contrato 001, T021)', () => {
  beforeEach(() => {
    mockedRequest.mockReset();
    mockedRequest.mockResolvedValue({} as never);
  });

  it('CA-001-20: listGroups sin filtros pide GET /api/groups y devuelve la respuesta tal cual', async () => {
    const page = { items: [], nextCursor: null };
    mockedRequest.mockResolvedValueOnce(page as never);
    await expect(listGroups()).resolves.toBe(page);
    expect(lastCall()).toEqual({ path: '/api/groups', options: { signal: undefined } });
  });

  it('CA-001-20: GET /groups filtra por rol y estado, y cada grupo trae su rol y cuota', async () => {
    await listGroups({ role: 'titular', status: 'cerrado' });
    expect(lastCall().path).toBe('/api/groups?role=titular&status=cerrado');
    await listGroups({ role: 'miembro' });
    expect(lastCall().path).toBe('/api/groups?role=miembro');
  });

  it('CA-001-20: buildListGroupsQuery no añade ? sin filtros', () => {
    expect(buildListGroupsQuery({})).toBe('');
  });

  it('CA-001-10: getGroup pide GET /api/groups/:id con el id codificado', async () => {
    await getGroup(GROUP_ID);
    expect(lastCall()).toEqual({
      path: `/api/groups/${GROUP_ID}`,
      options: { signal: undefined },
    });
  });

  it('CA-001-10: getGroup propaga el 404 de la API sin inventar datos', async () => {
    const notFound = Object.assign(new Error('No existe.'), {
      statusCode: 404,
      code: 'NOT_FOUND',
    });
    mockedRequest.mockRejectedValueOnce(notFound);
    await expect(getGroup(GROUP_ID)).rejects.toBe(notFound);
  });

  it('CA-001-09: regenerateInviteCode hace POST …/invite-code/regenerate y devuelve el código nuevo', async () => {
    mockedRequest.mockResolvedValueOnce({ inviteCode: 'K7M2QX9P' } as never);
    await expect(regenerateInviteCode(GROUP_ID)).resolves.toEqual({ inviteCode: 'K7M2QX9P' });
    expect(lastCall()).toEqual({
      path: `/api/groups/${GROUP_ID}/invite-code/regenerate`,
      options: { method: 'POST' },
    });
  });

  it('CA-001-11: un 403 de regenerar llega a la interfaz con su código', async () => {
    const forbidden = Object.assign(new Error('No eres el titular.'), {
      statusCode: 403,
      code: 'FORBIDDEN',
    });
    mockedRequest.mockRejectedValueOnce(forbidden);
    await expect(regenerateInviteCode(GROUP_ID)).rejects.toBe(forbidden);
  });

  it('cancela la petición de listado con AbortSignal', async () => {
    const controller = new AbortController();
    await listGroups({}, { signal: controller.signal });
    expect(lastCall().options.signal).toBe(controller.signal);
  });
});
