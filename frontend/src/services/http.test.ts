import { ApiError, NETWORK_ERROR_CODE, apiRequest, isConnectionError, toApiError } from './http';

/** Respuesta mínima con la forma que usa `apiRequest` (jsdom no trae `Response`). */
function fakeResponse(status: number, body: string): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
  } as unknown as Response;
}

const fetchMock = jest.fn();

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});

describe('services/http (contrato 000 A.2 y C)', () => {
  it('RF-000-11: envía JSON a la ruta del proxy con método, cuerpo y encabezados', async () => {
    fetchMock.mockResolvedValue(fakeResponse(201, '{"ok":true}'));

    const result = await apiRequest<{ ok: boolean }>('/api/auth/register', {
      method: 'POST',
      body: { a: 1 },
    });

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/register', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: '{"a":1}',
      credentials: 'same-origin',
      cache: 'no-store',
    });
  });

  it('RF-000-11: un GET no lleva cuerpo ni Content-Type', async () => {
    fetchMock.mockResolvedValue(fakeResponse(200, '{}'));
    await apiRequest('/api/auth/me');
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/me', {
      method: 'GET',
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
      cache: 'no-store',
    });
  });

  it('RF-000-11: una respuesta sin cuerpo (204) devuelve undefined', async () => {
    fetchMock.mockResolvedValue(fakeResponse(204, ''));
    await expect(apiRequest('/api/auth/logout', { method: 'POST' })).resolves.toBeUndefined();
  });

  it('RF-000-11: convierte el formato de error A.2 en un ApiError con code y details', async () => {
    fetchMock.mockResolvedValue(
      fakeResponse(
        400,
        JSON.stringify({
          statusCode: 400,
          code: 'VALIDATION_ERROR',
          message: 'Hay datos inválidos.',
          details: { fields: { ci: ['INVALID_CI'] } },
        }),
      ),
    );

    const error = await apiRequest('/api/auth/register', { method: 'POST', body: {} }).catch(
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'Hay datos inválidos.',
      details: { fields: { ci: ['INVALID_CI'] } },
    });
    expect(isConnectionError(error)).toBe(false);
  });

  it('RF-000-11: un error sin el formato A.2 se trata como respuesta inesperada', async () => {
    fetchMock.mockResolvedValue(fakeResponse(500, '<html>Bad gateway</html>'));
    const error = await apiRequest('/api/x').catch((e: unknown) => e);
    expect(error).toMatchObject({ statusCode: 500, code: 'UNEXPECTED_RESPONSE' });
  });

  it('RF-000-11: un 2xx con JSON inválido también es respuesta inesperada', async () => {
    fetchMock.mockResolvedValue(fakeResponse(200, 'no-json'));
    const error = await apiRequest('/api/x').catch((e: unknown) => e);
    expect(error).toMatchObject({ statusCode: 200, code: 'UNEXPECTED_RESPONSE' });
  });

  it('RF-000-15: la red caída se convierte en un error de conexión', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const error = await apiRequest('/api/x').catch((e: unknown) => e);
    expect(error).toMatchObject({ statusCode: 0, code: NETWORK_ERROR_CODE });
    expect(isConnectionError(error)).toBe(true);
  });

  it('RF-000-15: 504 UPSTREAM_TIMEOUT del proxy cuenta como error de conexión', async () => {
    fetchMock.mockResolvedValue(
      fakeResponse(
        504,
        JSON.stringify({
          statusCode: 504,
          code: 'UPSTREAM_TIMEOUT',
          message: 'El servidor tardó demasiado en responder.',
        }),
      ),
    );
    const error = await apiRequest('/api/x').catch((e: unknown) => e);
    expect(error).toMatchObject({ statusCode: 504, code: 'UPSTREAM_TIMEOUT' });
    expect(isConnectionError(error)).toBe(true);
  });

  it('RF-000-15: 503 SERVICE_UNAVAILABLE cuenta como error de conexión', async () => {
    fetchMock.mockResolvedValue(
      fakeResponse(
        503,
        JSON.stringify({
          statusCode: 503,
          code: 'SERVICE_UNAVAILABLE',
          message: 'No se pudo contactar con el servidor.',
        }),
      ),
    );
    const error = await apiRequest('/api/x').catch((e: unknown) => e);
    expect(isConnectionError(error)).toBe(true);
  });

  it('RF-000-11: toApiError conserva un ApiError y envuelve cualquier otro error', () => {
    const original = new ApiError(409, 'EMAIL_TAKEN', 'Ese correo ya está registrado.');
    expect(toApiError(original)).toBe(original);
    expect(toApiError(new Error('boom'))).toMatchObject({
      statusCode: 0,
      code: 'UNEXPECTED_RESPONSE',
    });
  });
});
