/** @jest-environment node */
import { createProxyHandler } from './forward';
import { GET, POST, dynamic, runtime } from './route';

const BACKEND = 'http://backend.test:3001';
const APP = 'http://localhost:3000';

type FetchArgs = [input: string | URL | Request, init?: RequestInit];

let fetchMock: jest.SpyInstance<Promise<Response>, FetchArgs>;

beforeEach(() => {
  process.env.BACKEND_URL = BACKEND;
  fetchMock = jest.spyOn(global, 'fetch') as unknown as jest.SpyInstance<
    Promise<Response>,
    FetchArgs
  >;
});

afterEach(() => {
  fetchMock.mockRestore();
  delete process.env.BACKEND_URL;
});

function json(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(body), { ...init, headers });
}

function lastCall(): { url: string; init: RequestInit } {
  const [input, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
  return { url: String(input), init: init ?? {} };
}

function sentHeaders(): Headers {
  return new Headers(lastCall().init.headers);
}

function setCookies(response: Response): string[] {
  return response.headers.getSetCookie();
}

function req(path: string, init: RequestInit = {}): Request {
  return new Request(`${APP}${path}`, init);
}

describe('proxy /api/[...path] (RF-000-15, contrato C)', () => {
  it('RF-000-15: exporta los handlers con render dinámico y runtime Node', () => {
    expect(dynamic).toBe('force-dynamic');
    expect(runtime).toBe('nodejs');
    expect(typeof GET).toBe('function');
    expect(typeof POST).toBe('function');
  });

  it('RF-000-15: reenvía método, ruta y query al backend', async () => {
    fetchMock.mockResolvedValue(json({ items: [], nextCursor: null }));
    const res = await GET(req('/api/groups/abc/charges?limit=5&cursor=x%20y'));
    expect(res.status).toBe(200);
    const { url, init } = lastCall();
    expect(url).toBe(`${BACKEND}/groups/abc/charges?limit=5&cursor=x%20y`);
    expect(init.method).toBe('GET');
    expect(init.body).toBeUndefined();
    expect(await res.json()).toEqual({ items: [], nextCursor: null });
  });

  it('RF-000-15: respeta el prefijo de ruta de BACKEND_URL', async () => {
    process.env.BACKEND_URL = 'http://backend.test:3001/v/';
    fetchMock.mockResolvedValue(json({ status: 'ok' }));
    await GET(req('/api/health'));
    expect(lastCall().url).toBe('http://backend.test:3001/v/health');
  });

  it('RF-000-15: reenvía el cuerpo en streaming con duplex half', async () => {
    fetchMock.mockResolvedValue(json({ ok: true }, { status: 201 }));
    const res = await POST(
      req('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Netflix' }),
      }),
    );
    expect(res.status).toBe(201);
    const { init } = lastCall();
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(ReadableStream);
    expect((init as RequestInit & { duplex?: string }).duplex).toBe('half');
    expect(await new Response(init.body).text()).toBe('{"name":"Netflix"}');
  });

  it('RF-000-15: reenvía multipart sin tocar el cuerpo ni el boundary', async () => {
    fetchMock.mockResolvedValue(json({ ok: true }));
    const form = new FormData();
    form.append('reference', 'REF-1');
    form.append('file', new Blob(['%PDF-1.4'], { type: 'application/pdf' }), 'c.pdf');
    const incoming = req('/api/charges/1/receipt', { method: 'POST', body: form });
    const contentType = incoming.headers.get('content-type');
    await POST(incoming);
    expect(sentHeaders().get('content-type')).toBe(contentType);
    expect(contentType).toMatch(/^multipart\/form-data; boundary=/);
    const text = await new Response(lastCall().init.body).text();
    expect(text).toContain('REF-1');
    expect(text).toContain('%PDF-1.4');
  });

  it('RF-000-15: pasa solo los encabezados permitidos y no reenvía Cookie ni Host', async () => {
    fetchMock.mockResolvedValue(json({}));
    await GET(
      req('/api/auth/me', {
        headers: {
          Accept: 'application/json',
          'X-Request-Id': 'req-1',
          Cookie: 'vq_session=tok; otra=1',
          Host: 'evil.test',
          'X-Forwarded-For': '1.2.3.4',
          Authorization: 'Bearer del-navegador',
          'X-Jobs-Token': 'no',
        },
      }),
    );
    const headers = sentHeaders();
    expect(headers.get('accept')).toBe('application/json');
    expect(headers.get('x-request-id')).toBe('req-1');
    expect(headers.get('cookie')).toBeNull();
    expect(headers.get('host')).toBeNull();
    expect(headers.get('x-forwarded-for')).toBeNull();
    expect(headers.get('x-jobs-token')).toBeNull();
    expect(headers.get('authorization')).toBe('Bearer tok');
  });

  it('RF-000-15: sin cookie no envía Authorization (ni la del navegador)', async () => {
    fetchMock.mockResolvedValue(json({}));
    await GET(req('/api/health', { headers: { Authorization: 'Bearer falso' } }));
    expect(sentHeaders().get('authorization')).toBeNull();
  });

  it('RF-000-15: guarda sessionToken en la cookie httpOnly y lo quita del cuerpo', async () => {
    fetchMock.mockResolvedValue(json({ sessionToken: 'jwt-1', user: { id: 'u1' } }));
    const res = await POST(
      req('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ user: { id: 'u1' } });
    const cookies = setCookies(res);
    expect(cookies).toHaveLength(1);
    expect(cookies[0]).toMatch(
      /^vq_session=jwt-1; Path=\/; Max-Age=604800; HttpOnly; SameSite=Lax/,
    );
  });

  it('RF-000-15: el cambio de contraseña reemplaza la cookie con el sessionToken nuevo', async () => {
    fetchMock.mockResolvedValue(json({ sessionToken: 'jwt-nuevo' }));
    const res = await POST(
      req('/api/auth/password/change', { method: 'POST', headers: { Cookie: 'vq_session=viejo' } }),
    );
    expect(await res.json()).toEqual({});
    expect(setCookies(res)[0]).toMatch(/^vq_session=jwt-nuevo;/);
  });

  it('RF-000-15: guarda registrationSecret en vq_reg (24 h) y lo quita del cuerpo', async () => {
    const verification = { telegramUrl: 'https://t.me/bot?start=t', expiresAt: 'x' };
    fetchMock.mockResolvedValue(
      json({ registrationSecret: 'reg-1', verification }, { status: 201 }),
    );
    const res = await POST(req('/api/auth/register', { method: 'POST', body: '{}' }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ verification });
    const cookies = setCookies(res);
    expect(cookies).toHaveLength(1);
    expect(cookies[0]).toMatch(/^vq_reg=reg-1; Path=\/; Max-Age=86400; HttpOnly; SameSite=Lax/);
    expect(sentHeaders().get('x-registration-secret')).toBeNull();
  });

  it('RF-000-15: agrega X-Registration-Secret desde vq_reg solo en /auth/register/*', async () => {
    fetchMock.mockImplementation(async () => json({ status: 'pending', expiresAt: 'x' }));
    const cookie = { Cookie: 'vq_reg=reg-1' };

    await GET(req('/api/auth/register/status', { headers: cookie }));
    expect(sentHeaders().get('x-registration-secret')).toBe('reg-1');

    await POST(req('/api/auth/register/link', { method: 'POST', headers: cookie }));
    expect(sentHeaders().get('x-registration-secret')).toBe('reg-1');

    await POST(req('/api/auth/register', { method: 'POST', headers: cookie, body: '{}' }));
    expect(sentHeaders().get('x-registration-secret')).toBeNull();

    await GET(req('/api/auth/me', { headers: cookie }));
    expect(sentHeaders().get('x-registration-secret')).toBeNull();
  });

  it('RF-000-15: el registro verificado guarda la sesión y borra vq_reg', async () => {
    fetchMock.mockResolvedValue(
      json({ status: 'verified', sessionToken: 'jwt-2', user: { id: 'u1' } }),
    );
    const res = await GET(req('/api/auth/register/status', { headers: { Cookie: 'vq_reg=r' } }));
    expect(await res.json()).toEqual({ status: 'verified', user: { id: 'u1' } });
    const cookies = setCookies(res);
    expect(cookies).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^vq_session=jwt-2; /),
        expect.stringMatching(/^vq_reg=; Path=\/; Max-Age=0;/),
      ]),
    );
  });

  it('RF-000-15: X-Session-Token renueva la cookie y no llega al navegador', async () => {
    fetchMock.mockResolvedValue(json({ id: 'u1' }, { headers: { 'X-Session-Token': 'jwt-3' } }));
    const res = await GET(req('/api/auth/me', { headers: { Cookie: 'vq_session=jwt-viejo' } }));
    expect(res.headers.get('x-session-token')).toBeNull();
    expect(setCookies(res)[0]).toMatch(/^vq_session=jwt-3; Path=\/; Max-Age=604800;/);
  });

  it('RF-000-15: un 401 del backend borra vq_session y devuelve el error tal cual', async () => {
    const error = { statusCode: 401, code: 'UNAUTHENTICATED', message: 'Inicia sesión.' };
    fetchMock.mockResolvedValue(json(error, { status: 401 }));
    const res = await GET(req('/api/auth/me', { headers: { Cookie: 'vq_session=vencido' } }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual(error);
    expect(setCookies(res)).toEqual([expect.stringMatching(/^vq_session=; Path=\/; Max-Age=0;/)]);
  });

  it('RF-000-15: logout borra ambas cookies cuando el backend responde 204', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    const res = await POST(
      req('/api/auth/logout', { method: 'POST', headers: { Cookie: 'vq_session=t; vq_reg=r' } }),
    );
    expect(res.status).toBe(204);
    expect(res.body).toBeNull();
    expect(sentHeaders().get('authorization')).toBe('Bearer t');
    expectBothCleared(res);
  });

  it('RF-000-15: logout borra ambas cookies aunque el backend responda 401', async () => {
    fetchMock.mockResolvedValue(
      json({ statusCode: 401, code: 'UNAUTHENTICATED' }, { status: 401 }),
    );
    const res = await POST(req('/api/auth/logout', { method: 'POST' }));
    expect(res.status).toBe(401);
    expectBothCleared(res);
  });

  it('RF-000-15: logout borra ambas cookies aunque el backend no responda', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    const res = await POST(req('/api/auth/logout', { method: 'POST' }));
    expect(res.status).toBe(503);
    expectBothCleared(res);
  });

  it('RF-000-15: agotado el tiempo de espera responde 504 UPSTREAM_TIMEOUT', async () => {
    fetchMock.mockImplementation(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
        }),
    );
    const handler = createProxyHandler({ timeoutMs: 20 });
    const res = await handler(req('/api/health'));
    expect(res.status).toBe(504);
    expect(await res.json()).toEqual({
      statusCode: 504,
      code: 'UPSTREAM_TIMEOUT',
      message: 'El servidor tardó demasiado en responder. Intenta de nuevo en unos segundos.',
    });
  });

  it('RF-000-15: el tiempo de espera por defecto es de 30 s', async () => {
    jest.useFakeTimers();
    try {
      fetchMock.mockImplementation(
        (_input, init) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
          }),
      );
      const pending = GET(req('/api/health'));
      await jest.advanceTimersByTimeAsync(29_999);
      expect(lastCall().init.signal?.aborted).toBe(false);
      await jest.advanceTimersByTimeAsync(1);
      const res = await pending;
      expect(res.status).toBe(504);
    } finally {
      jest.useRealTimers();
    }
  });

  it('RF-000-15: con el backend caído responde 503 sin detalles internos', async () => {
    fetchMock.mockRejectedValue(
      Object.assign(new TypeError('fetch failed'), { cause: new Error('ECONNREFUSED 127.0.0.1') }),
    );
    const res = await GET(req('/api/health'));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).toEqual({
      statusCode: 503,
      code: 'SERVICE_UNAVAILABLE',
      message: 'No se pudo contactar con el servidor.',
    });
    expect(JSON.stringify(body)).not.toMatch(/ECONNREFUSED|fetch failed|127\.0\.0\.1/);
  });

  it('RF-000-15: sin BACKEND_URL responde 503 sin llamar al backend', async () => {
    delete process.env.BACKEND_URL;
    const res = await GET(req('/api/health'));
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe('SERVICE_UNAVAILABLE');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    '/api/%2e%2e/admin',
    '/api/groups/%2E%2E',
    '/api/groups/%2e',
    '/api/groups/..%2fadmin',
    '/api/groups/a%5Cb',
    '/api/http:%2F%2Fevil.test',
    '/api/http:/evil.test',
    '/api//evil.test',
    '/api/groups//x',
    '/api/groups/%2F',
    '/api/groups/%00',
    '/api/groups/%E0%A4%A',
    '/api',
    '/api/',
  ])('RF-000-15: rechaza la ruta insegura %s con 400 sin llamar al backend', async (path) => {
    const res = await GET(new Request(`${APP}${path}`));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'La ruta solicitada no es válida.',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('RF-000-15: no pasa Set-Cookie del backend y solo deja los encabezados permitidos', async () => {
    fetchMock.mockResolvedValue(
      json(
        { ok: true },
        {
          headers: {
            'Set-Cookie': 'backend=1; Path=/',
            'X-Request-Id': 'req-9',
            'Retry-After': '30',
            'Cache-Control': 'no-store',
            'X-Powered-By': 'Express',
            Server: 'nest',
          },
        },
      ),
    );
    const res = await GET(req('/api/health'));
    expect(setCookies(res)).toEqual([]);
    expect(res.headers.get('x-request-id')).toBe('req-9');
    expect(res.headers.get('retry-after')).toBe('30');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('content-type')).toBe('application/json; charset=utf-8');
    expect(res.headers.get('x-powered-by')).toBeNull();
    expect(res.headers.get('server')).toBeNull();
  });

  it('RF-000-15: una respuesta 204 se devuelve sin cuerpo', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    const res = await POST(req('/api/auth/password/reset', { method: 'POST', body: '{}' }));
    expect(res.status).toBe(204);
    expect(res.body).toBeNull();
  });

  it('RF-000-15: un CSV con Content-Disposition pasa tal cual en streaming', async () => {
    const csv = 'periodo;monto\n2026-10;Bs 25,50\n';
    fetchMock.mockResolvedValue(
      new Response(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="reporte.csv"',
        },
      }),
    );
    const res = await GET(req('/api/reports/groups/1/export'));
    expect(res.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="reporte.csv"');
    expect(await res.text()).toBe(csv);
  });

  it('RF-000-15: un JSON sin secretos se devuelve sin reescribir', async () => {
    const raw = '{"b":1,  "a":[1,2]}';
    fetchMock.mockResolvedValue(
      new Response(raw, { headers: { 'Content-Type': 'application/json' } }),
    );
    const res = await GET(req('/api/groups'));
    expect(await res.text()).toBe(raw);
  });
});

function expectBothCleared(res: Response): void {
  expect(setCookies(res)).toEqual(
    expect.arrayContaining([
      expect.stringMatching(/^vq_session=; Path=\/; Max-Age=0;/),
      expect.stringMatching(/^vq_reg=; Path=\/; Max-Age=0;/),
    ]),
  );
}
