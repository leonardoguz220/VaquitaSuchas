import { apiRequest } from './http';
import {
  buildListGroupsQuery,
  createGroup,
  getGroup,
  getHostEligibility,
  listGroups,
  quoteGroup,
  regenerateInviteCode,
  updatePaymentInfo,
} from './groups';

jest.mock('./http', () => ({ apiRequest: jest.fn() }));

const mockedRequest = jest.mocked(apiRequest);
const GROUP_ID = '5b0d7c3e-0000-4000-8000-0000000000a1';

function lastCall() {
  const call = mockedRequest.mock.calls.at(-1);
  if (!call) throw new Error('apiRequest no se llamó');
  return { path: call[0], options: call[1] ?? {} };
}

describe('services/groups conectado al backend (contrato 001, T017 y T021)', () => {
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

  it('CA-001-25: GET /users/me/host-eligibility pide la elegibilidad sin datos simulados', async () => {
    const eligibility = {
      eligible: false,
      source: null,
      current: { stars: null, consideredCharges: 0, level: null },
    };
    mockedRequest.mockResolvedValueOnce(eligibility as never);
    await expect(getHostEligibility()).resolves.toBe(eligibility);
    expect(lastCall()).toEqual({
      path: '/api/users/me/host-eligibility',
      options: { signal: undefined },
    });
  });

  it('CA-001-24: una persona sin calificación llega con stars null, sin inventar un número', async () => {
    mockedRequest.mockResolvedValueOnce({
      current: { stars: null, consideredCharges: 0, level: null },
    } as never);
    const eligibility = await getHostEligibility();
    expect(eligibility.current.stars).toBeNull();
  });

  it('CA-001-01: POST /groups/quote envía el cuerpo tal cual y no calcula nada', async () => {
    const quote = {
      totalBsCents: 10203,
      baseShareCents: 2550,
      ownerShareCents: 2553,
      remainderCents: 3,
    };
    mockedRequest.mockResolvedValueOnce(quote as never);
    const input = {
      priceCents: 1466,
      currency: 'USD' as const,
      exchangeRate: '6.9600',
      memberCount: 4,
    };
    await expect(quoteGroup(input)).resolves.toBe(quote);
    expect(lastCall()).toEqual({
      path: '/api/groups/quote',
      options: { method: 'POST', body: input, signal: undefined },
    });
  });

  it('CA-001-03: POST /groups envía el alta en BS sin tipo de cambio', async () => {
    const body = {
      catalogPlanSlug: null,
      customServiceName: 'Canva Pro',
      name: 'Diseño',
      priceCents: 6000,
      currency: 'BS' as const,
      billingDay: 5,
      totalSlots: 4,
      paymentInfoText: null,
    };
    await createGroup(body);
    expect(lastCall()).toEqual({ path: '/api/groups', options: { method: 'POST', body } });
  });

  it('CA-001-02: un 400 VALIDATION_ERROR de POST /groups llega con sus details.fields', async () => {
    const invalid = new Error('Datos inválidos.') as Error & {
      statusCode: number;
      code: string;
      details: unknown;
    };
    Object.assign(invalid, {
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      details: { fields: { exchangeRate: ['REQUIRED'] } },
    });
    mockedRequest.mockRejectedValueOnce(invalid);
    await expect(createGroup({} as never)).rejects.toBe(invalid);
  });

  it('CA-001-23: PUT payment-info envía multipart con texto y QR, sin fijar Content-Type', async () => {
    const qr = new File(['x'], 'qr.png', { type: 'image/png' });
    mockedRequest.mockResolvedValueOnce({
      paymentInfo: { text: 'Banco', qrUrl: null, configured: true },
    } as never);
    await updatePaymentInfo(GROUP_ID, { text: 'Banco', qr });
    const call = lastCall();
    expect(call.path).toBe(`/api/groups/${GROUP_ID}/payment-info`);
    expect(call.options.method).toBe('PUT');
    const form = call.options.body as FormData;
    expect(form).toBeInstanceOf(FormData);
    expect(form.get('text')).toBe('Banco');
    expect(form.get('qr')).toBeInstanceOf(File);
    expect(form.has('removeQr')).toBe(false);
  });

  it('CA-001-23: quitar el QR envía removeQr=true', async () => {
    await updatePaymentInfo(GROUP_ID, { removeQr: true });
    const form = lastCall().options.body as FormData;
    expect(form.get('removeQr')).toBe('true');
    expect(form.has('text')).toBe(false);
  });
});
