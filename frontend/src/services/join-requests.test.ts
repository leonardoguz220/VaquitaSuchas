import { getJoinRequest, listDisputes, openDispute, respondDispute } from './join-requests';
import { MOCK_JOIN_REQUEST_IDS as IDS } from './join-requests.mock';

// Los reclamos (T040) siguen con datos simulados. Las decisiones y el chat se prueban en
// `join-requests.host-chat.api.test.ts` y el resto de endpoints conectados en `*.api.test.ts`.

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
