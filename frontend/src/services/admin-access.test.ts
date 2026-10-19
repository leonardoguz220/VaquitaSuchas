/** @jest-environment node */
import { checkAdminAccess } from './admin-access';

const originalBackendUrl = process.env.BACKEND_URL;
const fetchMock = jest.fn();

function respond(status: number, body: unknown = {}) {
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  );
}

beforeEach(() => {
  process.env.BACKEND_URL = 'http://backend.test/v1';
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});

afterAll(() => {
  process.env.BACKEND_URL = originalBackendUrl;
});

describe('checkAdminAccess (RF-009-01, plan 009 §6)', () => {
  it('RF-009-01: con rol admin en GET /auth/me deja pasar y manda el token como Bearer', async () => {
    respond(200, { id: 'u1', role: 'admin' });
    await expect(checkAdminAccess('tok')).resolves.toBe('admin');
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe('http://backend.test/v1/auth/me');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    expect(init.cache).toBe('no-store');
  });

  it('CA-009-01: un usuario normal no entra al panel (forbidden)', async () => {
    respond(200, { id: 'u2', role: 'usuario' });
    await expect(checkAdminAccess('tok')).resolves.toBe('forbidden');
  });

  it('CA-009-01: un 403 del backend también se trata como sin permiso', async () => {
    respond(403, { code: 'FORBIDDEN' });
    await expect(checkAdminAccess('tok')).resolves.toBe('forbidden');
  });

  it('RF-009-01: sin cookie o con 401 la sesión no es válida', async () => {
    await expect(checkAdminAccess(undefined)).resolves.toBe('unauthenticated');
    expect(fetchMock).not.toHaveBeenCalled();
    respond(401, { code: 'UNAUTHENTICATED' });
    await expect(checkAdminAccess('tok')).resolves.toBe('unauthenticated');
  });

  it('RF-009-01: sin backend, con error 5xx, red caída o cuerpo raro no se concede el acceso', async () => {
    delete process.env.BACKEND_URL;
    await expect(checkAdminAccess('tok')).resolves.toBe('unavailable');
    process.env.BACKEND_URL = 'ftp://backend.test';
    await expect(checkAdminAccess('tok')).resolves.toBe('unavailable');
    process.env.BACKEND_URL = 'http://backend.test';
    respond(503);
    await expect(checkAdminAccess('tok')).resolves.toBe('unavailable');
    fetchMock.mockRejectedValue(new Error('down'));
    await expect(checkAdminAccess('tok')).resolves.toBe('unavailable');
    fetchMock.mockResolvedValue(new Response('no json', { status: 200 }));
    await expect(checkAdminAccess('tok')).resolves.toBe('unavailable');
    respond(200, ['admin']);
    await expect(checkAdminAccess('tok')).resolves.toBe('forbidden');
  });
});
