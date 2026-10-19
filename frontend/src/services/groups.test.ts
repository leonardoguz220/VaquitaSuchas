import {
  createGroup,
  getHostEligibility,
  quoteGroup,
  updatePaymentInfo,
  type CreateGroupRequest,
} from './groups';
import { ApiError, apiRequest } from './http';

jest.mock('./http', () => ({
  ...jest.requireActual('./http'),
  apiRequest: jest.fn(),
}));

const mockedRequest = jest.mocked(apiRequest);

beforeEach(() => mockedRequest.mockReset());

describe('services/groups (contrato 001): crear', () => {
  it('RF-001-21: getHostEligibility hace GET /api/users/me/host-eligibility', async () => {
    const response = { eligible: false };
    mockedRequest.mockResolvedValue(response);
    await expect(getHostEligibility()).resolves.toBe(response);
    expect(mockedRequest).toHaveBeenCalledWith('/api/users/me/host-eligibility');
  });

  it('RF-001-03: quoteGroup hace POST /api/groups/quote con el cuerpo del contrato', async () => {
    const quote = {
      totalBsCents: 10203,
      baseShareCents: 2550,
      ownerShareCents: 2553,
      remainderCents: 3,
    };
    mockedRequest.mockResolvedValue(quote);
    const input = {
      priceCents: 1466,
      currency: 'USD' as const,
      exchangeRate: '6.9600',
      memberCount: 4,
    };
    await expect(quoteGroup(input)).resolves.toEqual(quote);
    expect(mockedRequest).toHaveBeenCalledWith('/api/groups/quote', {
      method: 'POST',
      body: input,
    });
  });

  it('RF-001-01: createGroup hace POST /api/groups y propaga los errores sin transformarlos', async () => {
    const input: CreateGroupRequest = {
      catalogPlanSlug: 'netflix-estandar',
      customServiceName: null,
      name: 'Netflix de la familia',
      priceCents: 1466,
      currency: 'USD',
      exchangeRate: '6.9600',
      billingDay: 1,
      totalSlots: 4,
      paymentInfoText: null,
    };
    mockedRequest.mockResolvedValue({ id: 'g1' });
    await createGroup(input);
    expect(mockedRequest).toHaveBeenCalledWith('/api/groups', { method: 'POST', body: input });

    const error = new ApiError(422, 'NOT_HOST_ELIGIBLE', 'x');
    mockedRequest.mockRejectedValue(error);
    await expect(createGroup(input)).rejects.toBe(error);
  });

  it('RF-001-20: updatePaymentInfo hace PUT multipart con text y qr', async () => {
    mockedRequest.mockResolvedValue({ paymentInfo: { configured: true } });
    const qr = new File(['png'], 'qr.png', { type: 'image/png' });
    await updatePaymentInfo('g/1', { text: 'Banco Unión', qr });

    const [path, options] = mockedRequest.mock.calls[0];
    expect(path).toBe('/api/groups/g%2F1/payment-info');
    expect(options?.method).toBe('PUT');
    const form = options?.formData as FormData;
    expect(form.get('text')).toBe('Banco Unión');
    expect(form.get('qr')).toBeInstanceOf(File);
    expect(form.has('removeQr')).toBe(false);
  });

  it('RF-001-20: updatePaymentInfo con removeQr manda removeQr=true y nada más', async () => {
    mockedRequest.mockResolvedValue({ paymentInfo: { configured: false } });
    await updatePaymentInfo('g1', { removeQr: true });
    const form = mockedRequest.mock.calls[0][1]?.formData as FormData;
    expect(Array.from(form.keys())).toEqual(['removeQr']);
    expect(form.get('removeQr')).toBe('true');
  });
});
