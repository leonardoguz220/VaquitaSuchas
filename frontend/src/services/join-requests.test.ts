import { openRequest } from './__fixtures__/join-requests';
import { apiRequest } from './http';
import {
  extendJoinRequest,
  getJoinRequest,
  getPaymentQr,
  listJoinRequests,
  openJoinRequest,
  sendPaymentData,
} from './join-requests';

jest.mock('./http', () => ({
  ...jest.requireActual('./http'),
  apiRequest: jest.fn(),
}));

const mockedRequest = jest.mocked(apiRequest);

beforeEach(() => mockedRequest.mockReset());

describe('services/join-requests (contrato 010): solicitud', () => {
  it('CA-010-01: openJoinRequest hace POST /api/join-requests con el código', async () => {
    mockedRequest.mockResolvedValue(openRequest);
    await expect(openJoinRequest('K7M2Q9XA')).resolves.toBe(openRequest);
    expect(mockedRequest).toHaveBeenCalledWith('/api/join-requests', {
      method: 'POST',
      body: { code: 'K7M2Q9XA' },
    });
  });

  it('RF-010-26: listJoinRequests sin filtros hace GET /api/join-requests', async () => {
    const page = { items: [], nextCursor: null };
    mockedRequest.mockResolvedValue(page);
    await expect(listJoinRequests()).resolves.toBe(page);
    expect(mockedRequest).toHaveBeenCalledWith('/api/join-requests');
  });

  it('RF-010-26: listJoinRequests manda rol, estados, grupo, límite y cursor en la query', async () => {
    mockedRequest.mockResolvedValue({ items: [], nextCursor: null });
    await listJoinRequests({
      role: 'solicitante',
      status: ['abierta', 'esperando_pago'],
      groupId: 'g7',
      limit: 20,
      cursor: 'abc',
    });
    expect(mockedRequest).toHaveBeenCalledWith(
      '/api/join-requests?role=solicitante&status=abierta%2Cesperando_pago&groupId=g7&limit=20&cursor=abc',
    );
  });
});

describe('services/join-requests (contrato 010): detalle y datos de pago', () => {
  it('CA-010-20: getJoinRequest hace GET /api/join-requests/:id con el id codificado', async () => {
    mockedRequest.mockResolvedValue(openRequest);
    await expect(getJoinRequest('jr/1')).resolves.toBe(openRequest);
    expect(mockedRequest).toHaveBeenCalledWith('/api/join-requests/jr%2F1');
  });

  it('CA-010-04: sendPaymentData sin datos manda un multipart vacío (usa los del grupo)', async () => {
    mockedRequest.mockResolvedValue(openRequest);
    await sendPaymentData('jr1');
    const [path, options] = mockedRequest.mock.calls[0];
    expect(path).toBe('/api/join-requests/jr1/payment-data');
    expect(options?.method).toBe('POST');
    const form = options?.formData as FormData;
    expect([...form.keys()]).toEqual([]);
  });

  it('RF-010-11: sendPaymentData manda texto, QR y versión', async () => {
    mockedRequest.mockResolvedValue(openRequest);
    const qr = new File(['x'], 'qr.png', { type: 'image/png' });
    await sendPaymentData('jr1', { text: 'BNB 123', qr, version: 2 });
    const form = mockedRequest.mock.calls[0][1]?.formData as FormData;
    expect(form.get('text')).toBe('BNB 123');
    expect(form.get('qr')).toBe(qr);
    expect(form.get('version')).toBe('2');
  });

  it('CA-010-42: extendJoinRequest hace POST /api/join-requests/:id/extend', async () => {
    mockedRequest.mockResolvedValue(openRequest);
    await extendJoinRequest('jr1', { version: 3 });
    expect(mockedRequest).toHaveBeenCalledWith('/api/join-requests/jr1/extend', {
      method: 'POST',
      body: { version: 3 },
    });
  });

  it('RF-010-11: getPaymentQr pide la URL firmada del QR', async () => {
    const link = { url: 'https://x', expiresAt: '2026-10-18T18:51:00.000Z', mime: 'image/png' };
    mockedRequest.mockResolvedValue(link);
    await expect(getPaymentQr('jr1')).resolves.toBe(link);
    expect(mockedRequest).toHaveBeenCalledWith('/api/join-requests/jr1/payment-qr');
  });
});
