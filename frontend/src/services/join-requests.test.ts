import {
  cancelJoinRequest,
  confirmJoinRequest,
  extendJoinRequest,
  getJoinRequest,
  getMessageImage,
  getPaymentQr,
  listDisputes,
  listJoinRequests,
  listMessages,
  markMessagesRead,
  openDispute,
  openJoinRequest,
  registerCashPayment,
  rejectJoinRequest,
  respondDispute,
  sendMessage,
  sendPaymentData,
  uploadJoinProof,
} from './join-requests';
import {
  MOCK_INVITE_CODES,
  MOCK_JOIN_REQUEST_IDS as IDS,
  MOCK_PROOF_REFERENCES,
} from './join-requests.mock';

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

const image = (type = 'image/jpeg', size = 1024) =>
  new File([new Uint8Array(size)], 'foto.jpg', { type });

describe('services/join-requests con datos simulados (contrato 010): solicitud', () => {
  it('CA-010-01: openJoinRequest con un código válido abre una solicitud `abierta`', async () => {
    const request = await settle(openJoinRequest(` ${MOCK_INVITE_CODES.valid.toLowerCase()} `));
    expect(request.phase.status).toBe('abierta');
    expect(request.phase.deadlineKind).toBe('solicitud');
    expect(request.allowedActions).toEqual(expect.arrayContaining(['cancel', 'sendMessage']));
  });

  it('CA-010-02: openJoinRequest responde los errores del contrato', async () => {
    await expectRejection(openJoinRequest('ZZZZZZZZ'), { code: 'INVALID_INVITE_CODE' });
    await expectRejection(openJoinRequest(MOCK_INVITE_CODES.windowClosed), {
      code: 'ENTRY_WINDOW_CLOSED',
    });
    await expectRejection(openJoinRequest(MOCK_INVITE_CODES.noSlots), {
      code: 'NO_SLOTS_AVAILABLE',
    });
  });

  it('RF-010-26: listJoinRequests separa solicitante y titular y filtra por estado', async () => {
    const mine = await settle(listJoinRequests({ role: 'solicitante' }));
    expect(mine.nextCursor).toBeNull();
    expect(mine.items.length).toBeGreaterThan(2);
    const host = await settle(listJoinRequests({ role: 'titular' }));
    expect(host.items.map((request) => request.id)).toEqual([IDS.hostOpen, IDS.hostReported]);
    const active = await settle(
      listJoinRequests({ role: 'solicitante', status: ['esperando_pago'] }),
    );
    expect(active.items.map((request) => request.phase.status)).toEqual(['esperando_pago']);
  });

  it('CA-010-20: getJoinRequest responde 404 a un id desconocido', async () => {
    await expectRejection(getJoinRequest('otro'), { statusCode: 404 });
  });

  it('RNF-010-03: cada solicitud trae serverNow y deadlineAt para la cuenta regresiva', async () => {
    const request = await settle(getJoinRequest(IDS.awaitingPayment));
    expect(request.phase.serverNow).toEqual(expect.any(String));
    expect(Date.parse(request.phase.deadlineAt ?? '')).toBeGreaterThan(
      Date.parse(request.phase.serverNow),
    );
  });
});

describe('services/join-requests con datos simulados (contrato 010): datos de pago', () => {
  it('RF-010-11: sendPaymentData pasa la solicitud a `esperando_pago` con la cuota del servidor', async () => {
    const request = await settle(sendPaymentData(IDS.hostOpen, { text: 'BNB 123', version: 1 }));
    expect(request.phase.status).toBe('esperando_pago');
    expect(request.quote?.amountCents).toEqual(expect.any(Number));
    expect(request.timeline.at(-1)?.type).toBe('datos_pago_enviados');
  });

  it('RF-010-11: sin texto ni QR responde PAYMENT_INFO_MISSING', async () => {
    await expectRejection(sendPaymentData(IDS.hostOpen, {}), { code: 'PAYMENT_INFO_MISSING' });
  });

  it('RNF-010-05: una versión vieja responde STALE_STATE', async () => {
    await expectRejection(sendPaymentData(IDS.hostOpen, { text: 'x', version: 99 }), {
      code: 'STALE_STATE',
    });
  });

  it('CA-010-42: extendJoinRequest solo lo puede hacer el titular, una vez', async () => {
    await expectRejection(extendJoinRequest(IDS.awaitingPayment, {}), {
      code: 'INVALID_TRANSITION',
    });
  });

  it('RF-010-11: getPaymentQr da una URL firmada si hay QR', async () => {
    const link = await settle(getPaymentQr(IDS.awaitingPayment));
    expect(link).toEqual(expect.objectContaining({ mime: 'image/png' }));
    await expectRejection(getPaymentQr(IDS.open), { statusCode: 404 });
  });
});

describe('services/join-requests con datos simulados (contrato 010): comprobante', () => {
  it('CA-010-07: uploadJoinProof pasa a `pago_informado` con el comprobante', async () => {
    const request = await settle(
      uploadJoinProof(IDS.awaitingPayment, {
        file: image(),
        method: 'qr',
        reference: ' QR-1 ',
        version: 2,
      }),
    );
    expect(request.phase.status).toBe('pago_informado');
    expect(request.proof).toEqual(expect.objectContaining({ reference: 'QR-1', method: 'qr' }));
  });

  it('RF-010-13, CA-010-40 y CA-010-41: el servidor valida tipo, tamaño y referencia', async () => {
    const input = { method: 'qr' as const, reference: 'QR-1' };
    await expectRejection(
      uploadJoinProof(IDS.awaitingPayment, { ...input, file: image('text/plain') }),
      { code: 'UNSUPPORTED_FILE_TYPE' },
    );
    await expectRejection(
      uploadJoinProof(IDS.awaitingPayment, { ...input, file: image('image/png', 6 * 1024 * 1024) }),
      { code: 'FILE_TOO_LARGE' },
    );
    await expectRejection(
      uploadJoinProof(IDS.awaitingPayment, {
        ...input,
        file: image(),
        reference: MOCK_PROOF_REFERENCES.alreadyUsed,
      }),
      { code: 'REFERENCE_ALREADY_USED' },
    );
  });
});

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
    const [ref] = (await settle(getJoinRequest(IDS.unanswered))).disputes;
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
