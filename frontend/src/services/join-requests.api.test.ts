import {
  extendJoinRequest,
  getJoinRequest,
  getJoinRequestsSummary,
  getPaymentQr,
  getProofFile,
  listGroupJoinRequests,
  listJoinRequests,
  openJoinRequest,
  sendPaymentData,
  uploadJoinProof,
} from './join-requests';
import { apiRequest } from './http';

jest.mock('./http', () => ({ apiRequest: jest.fn() }));

const mockedRequest = jest.mocked(apiRequest);
const REQUEST_ID = '6b1d3f0e-0000-4000-8000-0000000000a1';
const GROUP_ID = '6b1d3f0e-0000-4000-8000-0000000000g7';

function lastCall() {
  const call = mockedRequest.mock.calls.at(-1);
  if (!call) throw new Error('apiRequest no se llamó');
  return { path: call[0], options: call[1] ?? {} };
}

function formOf(body: unknown): FormData {
  expect(body).toBeInstanceOf(FormData);
  return body as FormData;
}

const image = (type: string, name: string) => new File([new Uint8Array(1024)], name, { type });

describe('services/join-requests conectado al backend (contrato 010)', () => {
  beforeEach(() => {
    mockedRequest.mockReset();
    mockedRequest.mockResolvedValue({} as never);
  });

  it('CA-010-01: openJoinRequest envía el código con POST /api/join-requests', async () => {
    await openJoinRequest('K7M2Q9XA');
    expect(lastCall()).toEqual({
      path: '/api/join-requests',
      options: { method: 'POST', body: { code: 'K7M2Q9XA' } },
    });
  });

  it('RF-010-26: listJoinRequests manda rol, estados (separados por coma), límite y cursor', async () => {
    await listJoinRequests({
      role: 'solicitante',
      status: ['abierta', 'esperando_pago'],
      limit: 20,
      cursor: 'abc',
    });
    expect(lastCall().path).toBe(
      '/api/join-requests?role=solicitante&status=abierta%2Cesperando_pago&limit=20&cursor=abc',
    );
  });

  it('RF-010-26: listJoinRequests sin filtros no añade query', async () => {
    await listJoinRequests();
    expect(lastCall().path).toBe('/api/join-requests');
  });

  it('RF-010-26: listGroupJoinRequests usa la cola del grupo, con sus cupos', async () => {
    await listGroupJoinRequests(GROUP_ID, { limit: 50 });
    expect(lastCall().path).toBe(`/api/groups/${GROUP_ID}/join-requests?limit=50`);
  });

  it('CA-010-20: getJoinRequest pide el detalle y deja pasar el error 404 tal cual', async () => {
    const { ApiError } = jest.requireActual('./http');
    const notFound = new ApiError(404, 'NOT_FOUND', 'No encontrado');
    mockedRequest.mockRejectedValueOnce(notFound);
    await expect(getJoinRequest(REQUEST_ID)).rejects.toBe(notFound);
    expect(lastCall().path).toBe(`/api/join-requests/${REQUEST_ID}`);
  });

  it('RF-010-26: getJoinRequestsSummary pide las insignias de la barra', async () => {
    await getJoinRequestsSummary();
    expect(lastCall().path).toBe('/api/me/join-requests/summary');
  });

  it('CA-010-04: sendPaymentData envía texto, QR y versión como multipart', async () => {
    const qr = image('image/png', 'qr.png');
    await sendPaymentData(REQUEST_ID, { text: 'Cuenta 123', qr, version: 2 });
    const { path, options } = lastCall();
    expect(path).toBe(`/api/join-requests/${REQUEST_ID}/payment-data`);
    expect(options.method).toBe('POST');
    const form = formOf(options.body);
    expect(form.get('text')).toBe('Cuenta 123');
    expect(form.get('qr')).toBeInstanceOf(File);
    expect(form.get('version')).toBe('2');
  });

  it('RF-010-11: sendPaymentData sin texto ni QR no añade esos campos', async () => {
    await sendPaymentData(REQUEST_ID);
    const form = formOf(lastCall().options.body);
    expect(form.has('text')).toBe(false);
    expect(form.has('qr')).toBe(false);
  });

  it('CA-010-42: extendJoinRequest hace POST …/extend sin cuerpo', async () => {
    await extendJoinRequest(REQUEST_ID, { version: 3 });
    expect(lastCall()).toEqual({
      path: `/api/join-requests/${REQUEST_ID}/extend`,
      options: { method: 'POST' },
    });
  });

  it('RNF-010-02: getPaymentQr pide la URL firmada del QR', async () => {
    await getPaymentQr(REQUEST_ID);
    expect(lastCall().path).toBe(`/api/join-requests/${REQUEST_ID}/payment-qr`);
  });

  it('CA-010-07: uploadJoinProof envía archivo, método y referencia como multipart', async () => {
    const file = image('image/jpeg', 'comprobante.jpg');
    await uploadJoinProof(REQUEST_ID, { file, method: 'qr', reference: 'REF-889', version: 1 });
    const { path, options } = lastCall();
    expect(path).toBe(`/api/join-requests/${REQUEST_ID}/proof`);
    const form = formOf(options.body);
    expect(form.get('file')).toBeInstanceOf(File);
    expect(form.get('method')).toBe('qr');
    expect(form.get('reference')).toBe('REF-889');
    expect(form.get('version')).toBe('1');
  });

  it('RF-010-13: getProofFile pide la URL firmada del comprobante', async () => {
    await getProofFile(REQUEST_ID);
    expect(lastCall().path).toBe(`/api/join-requests/${REQUEST_ID}/proof/file`);
  });

  it('CA-010-08: un error del servidor al subir el comprobante llega a quien llama', async () => {
    const { ApiError } = jest.requireActual('./http');
    mockedRequest.mockRejectedValueOnce(new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Demasiado grande'));
    await expect(
      uploadJoinProof(REQUEST_ID, {
        file: image('image/jpeg', 'grande.jpg'),
        method: 'transferencia',
        reference: 'REF-1',
      }),
    ).rejects.toMatchObject({ statusCode: 413 });
  });
});
