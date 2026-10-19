import {
  cancelJoinRequest,
  confirmJoinRequest,
  getMessageImage,
  listMessages,
  markMessagesRead,
  registerCashPayment,
  rejectJoinRequest,
  sendMessage,
} from './join-requests';
import { apiRequest, ApiError } from './http';

jest.mock('./http', () => {
  const actual = jest.requireActual('./http');
  return { ...actual, apiRequest: jest.fn() };
});

const mockedRequest = jest.mocked(apiRequest);
const REQUEST_ID = '6b1d3f0e-0000-4000-8000-0000000000a1';
const MESSAGE_ID = '6b1d3f0e-0000-4000-8000-0000000000m1';

function lastCall() {
  const call = mockedRequest.mock.calls.at(-1);
  if (!call) throw new Error('apiRequest no se llamó');
  return { path: call[0], options: call[1] ?? {} };
}

beforeEach(() => {
  mockedRequest.mockReset();
  mockedRequest.mockResolvedValue({} as never);
});

describe('decisiones del titular conectadas al backend (contrato 010)', () => {
  it('CA-010-11: confirmJoinRequest hace POST …/confirm con la versión en pantalla', async () => {
    await confirmJoinRequest(REQUEST_ID, { version: 4 });
    expect(lastCall()).toEqual({
      path: `/api/join-requests/${REQUEST_ID}/confirm`,
      options: { method: 'POST', body: { version: 4 } },
    });
  });

  it('CA-010-16: registerCashPayment hace POST …/cash-payment', async () => {
    await registerCashPayment(REQUEST_ID, { version: 2 });
    expect(lastCall()).toEqual({
      path: `/api/join-requests/${REQUEST_ID}/cash-payment`,
      options: { method: 'POST', body: { version: 2 } },
    });
  });

  it('CA-010-17: rejectJoinRequest envía el motivo y si el comprobante es falso', async () => {
    await rejectJoinRequest(REQUEST_ID, { reason: 'No llegó', markProofAsFalse: true, version: 3 });
    expect(lastCall()).toEqual({
      path: `/api/join-requests/${REQUEST_ID}/reject`,
      options: {
        method: 'POST',
        body: { reason: 'No llegó', markProofAsFalse: true, version: 3 },
      },
    });
  });

  it('CA-010-18: cancelJoinRequest hace POST …/cancel sin cuerpo', async () => {
    await cancelJoinRequest(REQUEST_ID);
    expect(lastCall()).toEqual({
      path: `/api/join-requests/${REQUEST_ID}/cancel`,
      options: { method: 'POST' },
    });
  });

  it('RF-010-17: un 409 STALE_STATE llega tal cual a quien llama', async () => {
    const stale = new ApiError(409, 'STALE_STATE', 'Cambió');
    mockedRequest.mockRejectedValueOnce(stale);
    await expect(confirmJoinRequest(REQUEST_ID, { version: 1 })).rejects.toBe(stale);
  });
});

describe('chat conectado al backend (contrato 010)', () => {
  it('CA-010-19: listMessages pide afterSeq y límite en la query', async () => {
    await listMessages(REQUEST_ID, { afterSeq: 2, limit: 50 });
    expect(lastCall().path).toBe(`/api/join-requests/${REQUEST_ID}/messages?afterSeq=2&limit=50`);
  });

  it('CA-010-19: listMessages sin parámetros no añade query', async () => {
    await listMessages(REQUEST_ID);
    expect(lastCall().path).toBe(`/api/join-requests/${REQUEST_ID}/messages`);
  });

  it('CA-010-22: el texto viaja tal cual, sin interpretar HTML', async () => {
    await sendMessage(REQUEST_ID, { text: '<script>alert(1)</script>' });
    const form = lastCall().options.body as FormData;
    expect(form).toBeInstanceOf(FormData);
    expect(form.get('text')).toBe('<script>alert(1)</script>');
    expect(form.has('image')).toBe(false);
  });

  it('CA-010-21: sendMessage con imagen envía el archivo; RATE_LIMITED llega con su espera', async () => {
    const image = new File([new Uint8Array(1024)], 'foto.jpg', { type: 'image/jpeg' });
    await sendMessage(REQUEST_ID, { image });
    expect((lastCall().options.body as FormData).get('image')).toBeInstanceOf(File);

    const limited = new ApiError(429, 'RATE_LIMITED', 'Espera', { retryAfterSeconds: 30 });
    mockedRequest.mockRejectedValueOnce(limited);
    await expect(sendMessage(REQUEST_ID, { text: 'Hola' })).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      details: { retryAfterSeconds: 30 },
    });
  });

  it('CA-010-24: CHAT_READ_ONLY llega a quien llama', async () => {
    mockedRequest.mockRejectedValueOnce(new ApiError(422, 'CHAT_READ_ONLY', 'Solo lectura'));
    await expect(sendMessage(REQUEST_ID, { text: 'Hola' })).rejects.toMatchObject({
      code: 'CHAT_READ_ONLY',
    });
  });

  it('RNF-010-02: getMessageImage pide la URL firmada de la imagen', async () => {
    await getMessageImage(REQUEST_ID, MESSAGE_ID);
    expect(lastCall().path).toBe(`/api/join-requests/${REQUEST_ID}/messages/${MESSAGE_ID}/image`);
  });

  it('RF-010-09: markMessagesRead hace POST …/read con upToSeq', async () => {
    await markMessagesRead(REQUEST_ID, 3);
    expect(lastCall()).toEqual({
      path: `/api/join-requests/${REQUEST_ID}/read`,
      options: { method: 'POST', body: { upToSeq: 3 } },
    });
  });

  it('CA-010-23: no existen funciones para editar ni borrar mensajes', async () => {
    const api = await import('./join-requests');
    const names = Object.keys(api).filter((name) => /message/i.test(name));
    expect(names.sort()).toEqual(
      ['getMessageImage', 'listMessages', 'markMessagesRead', 'sendMessage'].sort(),
    );
  });
});
