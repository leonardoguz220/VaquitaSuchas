import { openRequest } from './__fixtures__/join-requests';
import { apiRequest } from './http';
import {
  cancelJoinRequest,
  confirmJoinRequest,
  extendJoinRequest,
  getJoinRequest,
  getMessageImage,
  getPaymentQr,
  listJoinRequests,
  listMessages,
  markMessagesRead,
  openJoinRequest,
  registerCashPayment,
  rejectJoinRequest,
  sendMessage,
  sendPaymentData,
  uploadJoinProof,
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

describe('services/join-requests (contrato 010): comprobante', () => {
  it('CA-010-07: uploadJoinProof hace POST multipart con archivo, método, referencia y versión', async () => {
    mockedRequest.mockResolvedValue(openRequest);
    const file = new File(['x'], 'pago.jpg', { type: 'image/jpeg' });
    await uploadJoinProof('jr1', { file, method: 'qr', reference: 'QR-1', version: 2 });
    const [path, options] = mockedRequest.mock.calls[0];
    expect(path).toBe('/api/join-requests/jr1/proof');
    expect(options?.method).toBe('POST');
    const form = options?.formData as FormData;
    expect(form.get('file')).toBe(file);
    expect(form.get('method')).toBe('qr');
    expect(form.get('reference')).toBe('QR-1');
    expect(form.get('version')).toBe('2');
  });

  it('CA-010-40: uploadJoinProof no agrega la versión si no viene', async () => {
    mockedRequest.mockResolvedValue(openRequest);
    const file = new File(['x'], 'pago.pdf', { type: 'application/pdf' });
    await uploadJoinProof('jr1', { file, method: 'transferencia', reference: 'A' });
    const form = mockedRequest.mock.calls[0][1]?.formData as FormData;
    expect(form.has('version')).toBe(false);
  });
});

describe('services/join-requests (contrato 010): decisiones', () => {
  it.each([
    ['CA-010-11', 'confirm', confirmJoinRequest],
    ['CA-010-16', 'cash-payment', registerCashPayment],
    ['CA-010-18', 'cancel', cancelJoinRequest],
  ] as const)('%s: hace POST /api/join-requests/:id/%s con la versión', async (_ca, path, call) => {
    mockedRequest.mockResolvedValue(openRequest);
    await call('jr1', { version: 4 });
    expect(mockedRequest).toHaveBeenCalledWith(`/api/join-requests/jr1/${path}`, {
      method: 'POST',
      body: { version: 4 },
    });
  });

  it('CA-010-17: rejectJoinRequest manda motivo, comprobante falso y versión', async () => {
    mockedRequest.mockResolvedValue(openRequest);
    await rejectJoinRequest('jr1', { reason: 'No llegó', markProofAsFalse: true, version: 3 });
    expect(mockedRequest).toHaveBeenCalledWith('/api/join-requests/jr1/reject', {
      method: 'POST',
      body: { reason: 'No llegó', markProofAsFalse: true, version: 3 },
    });
  });
});

describe('services/join-requests (contrato 010): chat', () => {
  it('CA-010-19: listMessages pide los mensajes y con afterSeq solo los nuevos', async () => {
    mockedRequest.mockResolvedValue({ items: [], serverNow: '2026-10-18T18:41:00.000Z' });
    await listMessages('jr1');
    expect(mockedRequest).toHaveBeenLastCalledWith('/api/join-requests/jr1/messages');
    await listMessages('jr1', { afterSeq: 7, limit: 100 });
    expect(mockedRequest).toHaveBeenLastCalledWith(
      '/api/join-requests/jr1/messages?afterSeq=7&limit=100',
    );
  });

  it('CA-010-19: sendMessage hace POST multipart con texto e imagen', async () => {
    mockedRequest.mockResolvedValue({});
    const image = new File(['x'], 'foto.jpg', { type: 'image/jpeg' });
    await sendMessage('jr1', { text: 'Hola', image });
    const [path, options] = mockedRequest.mock.calls[0];
    expect(path).toBe('/api/join-requests/jr1/messages');
    expect(options?.method).toBe('POST');
    const form = options?.formData as FormData;
    expect(form.get('text')).toBe('Hola');
    expect(form.get('image')).toBe(image);
  });

  it('CA-010-23: no existen funciones para editar ni borrar mensajes', async () => {
    const api = await import('./join-requests');
    const names = Object.keys(api).filter((name) => /message/i.test(name));
    expect(names.sort()).toEqual(
      ['getMessageImage', 'listMessages', 'markMessagesRead', 'sendMessage'].sort(),
    );
  });

  it('RF-010-08: getMessageImage pide la URL firmada de la imagen', async () => {
    mockedRequest.mockResolvedValue({ url: 'https://x', expiresAt: 'y', mime: 'image/png' });
    await getMessageImage('jr1', 'm/2');
    expect(mockedRequest).toHaveBeenCalledWith('/api/join-requests/jr1/messages/m%2F2/image');
  });

  it('RF-010-09: markMessagesRead manda upToSeq', async () => {
    mockedRequest.mockResolvedValue(undefined);
    await markMessagesRead('jr1', 9);
    expect(mockedRequest).toHaveBeenCalledWith('/api/join-requests/jr1/read', {
      method: 'POST',
      body: { upToSeq: 9 },
    });
  });
});
