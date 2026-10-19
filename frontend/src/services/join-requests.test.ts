import {
  cancelJoinRequest,
  confirmJoinRequest,
  getMessageImage,
  listDisputes,
  listMessages,
  markMessagesRead,
  openDispute,
  registerCashPayment,
  rejectJoinRequest,
  respondDispute,
  sendMessage,
} from './join-requests';
import { MOCK_JOIN_REQUEST_IDS as IDS } from './join-requests.mock';

// Estas funciones siguen con datos simulados hasta sus tareas (decisiones T031, chat T035 y
// reclamos T040). Las conectadas se prueban en `join-requests.api.test.ts`.

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

async function settle<T>(promise: Promise<T>): Promise<T> {
  await jest.runAllTimersAsync();
  return promise;
}

async function expectRejection(promise: Promise<unknown>, shape: object) {
  const assertion = expect(promise).rejects.toMatchObject(shape);
  await jest.runAllTimersAsync();
  await assertion;
}

describe('services/join-requests con datos simulados (contrato 010): decisiones', () => {
  it('CA-010-11: confirmJoinRequest acepta y enlaza el cobro de ingreso', async () => {
    const request = await settle(confirmJoinRequest(IDS.hostReported, {}));
    expect(request.phase.status).toBe('aceptada');
    expect(request.chargeId).toEqual(expect.any(String));
  });

  it('CA-010-16: registerCashPayment solo si el titular puede hacerlo', async () => {
    await expectRejection(registerCashPayment(IDS.hostReported, {}), {
      code: 'INVALID_TRANSITION',
    });
  });

  it('CA-010-17: rejectJoinRequest guarda el motivo y si el comprobante es falso', async () => {
    const request = await settle(
      rejectJoinRequest(IDS.hostReported, { reason: 'No llegó', markProofAsFalse: true }),
    );
    expect(request.phase.status).toBe('rechazada');
    expect(request.rejectReason).toBe('No llegó');
    expect(request.rejectedAsFalse).toBe(true);
    await expectRejection(rejectJoinRequest(IDS.hostReported, { reason: ' ' }), {
      code: 'VALIDATION_ERROR',
    });
  });

  it('CA-010-18: cancelJoinRequest lo hace la persona solicitante', async () => {
    const request = await settle(cancelJoinRequest(IDS.open, {}));
    expect(request.phase.status).toBe('cancelada');
    await expectRejection(cancelJoinRequest(IDS.accepted, {}), { code: 'INVALID_TRANSITION' });
  });
});

describe('services/join-requests con datos simulados (contrato 010): chat', () => {
  it('CA-010-19: listMessages trae los mensajes y con afterSeq solo los nuevos', async () => {
    const all = await settle(listMessages(IDS.awaitingPayment));
    expect(all.items.map((message) => message.seq)).toEqual([1, 2, 3]);
    const newer = await settle(listMessages(IDS.awaitingPayment, { afterSeq: 2 }));
    expect(newer.items.map((message) => message.seq)).toEqual([3]);
  });

  it('RF-010-08: sendMessage devuelve el mensaje con el texto tal cual', async () => {
    const message = await settle(sendMessage(IDS.awaitingPayment, { text: '<i>Hola</i>' }));
    expect(message.body).toBe('<i>Hola</i>');
    await expectRejection(sendMessage(IDS.awaitingPayment, { text: ' ' }), {
      code: 'VALIDATION_ERROR',
    });
    await expectRejection(sendMessage(IDS.accepted, { text: 'Hola' }), {
      code: 'CHAT_READ_ONLY',
    });
  });

  it('CA-010-23: no existen funciones para editar ni borrar mensajes', async () => {
    const api = await import('./join-requests');
    const names = Object.keys(api).filter((name) => /message/i.test(name));
    expect(names.sort()).toEqual(
      ['getMessageImage', 'listMessages', 'markMessagesRead', 'sendMessage'].sort(),
    );
  });

  it('RNF-010-02: getMessageImage da la URL firmada solo si el mensaje tiene foto', async () => {
    const { items } = await settle(listMessages(IDS.awaitingPayment));
    const withImage = items.find((message) => message.imageAvailable);
    const withText = items.find((message) => !message.imageAvailable);
    await expect(
      settle(getMessageImage(IDS.awaitingPayment, withImage?.id ?? '')),
    ).resolves.toEqual(expect.objectContaining({ mime: 'image/jpeg' }));
    await expectRejection(getMessageImage(IDS.awaitingPayment, withText?.id ?? ''), {
      code: 'FILE_DELETED',
    });
  });

  it('RF-010-09: markMessagesRead valida upToSeq', async () => {
    await expect(settle(markMessagesRead(IDS.awaitingPayment, 3))).resolves.toBeUndefined();
    await expectRejection(markMessagesRead(IDS.awaitingPayment, -1), {
      code: 'VALIDATION_ERROR',
    });
  });
});

describe('services/join-requests con datos simulados (contrato 010): reclamos', () => {
  it('CA-010-27: openDispute solo si la solicitud lo permite', async () => {
    const dispute = await settle(openDispute(IDS.unanswered, { description: 'Pagué y nada' }));
    expect(dispute).toEqual(
      expect.objectContaining({ status: 'abierto', description: 'Pagué y nada' }),
    );
    await expectRejection(openDispute(IDS.open, { description: 'x' }), {
      code: 'DISPUTE_NOT_ALLOWED',
    });
  });

  it('RF-010-22: respondDispute rechaza a quien no puede responder', async () => {
    const [ref] = (await settle(listDisputes(IDS.unanswered))).items;
    await expectRejection(respondDispute(IDS.unanswered, ref.id, { text: 'Respuesta' }), {
      code: 'DISPUTE_ALREADY_RESPONDED',
    });
  });

  it('RF-010-21: listDisputes trae los reclamos de la solicitud', async () => {
    const { items } = await settle(listDisputes(IDS.unanswered));
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe('pago_sin_ingreso');
  });
});
