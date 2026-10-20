import { getInvitationShare, getReminderShare, sendInvitation } from './invitations';
import { MOCK_INVITATION_IDS, resetInvitationsMock } from './invitations.mock';

beforeEach(() => {
  jest.useFakeTimers();
  resetInvitationsMock();
});
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

describe('services/invitations con datos simulados (contrato 005, parte B)', () => {
  it('CA-005-14: sendInvitation responde 202 pendiente con un correo válido', async () => {
    await expect(settle(sendInvitation('g1', 'ana@example.com'))).resolves.toEqual({
      status: 'pendiente',
    });
    await expectRejection(sendInvitation('g1', 'no-es-correo'), { code: 'VALIDATION_ERROR' });
  });

  it('CA-005-16: la invitación número 11 en una hora responde 429 RATE_LIMITED', async () => {
    for (let index = 0; index < 10; index += 1) {
      await settle(sendInvitation('g1', `p${index}@example.com`));
    }
    await expectRejection(sendInvitation('g1', 'once@example.com'), {
      statusCode: 429,
      code: 'RATE_LIMITED',
      details: { retryAfterSeconds: expect.any(Number) },
    });
  });

  it('CA-005-17: getInvitationShare trae el enlace de invitación y el texto para WhatsApp', async () => {
    const share = await settle(getInvitationShare('g1'));
    expect(share.inviteUrl).toContain('/unirse?codigo=');
    expect(share.text).toContain(share.inviteUrl);
    await expectRejection(getInvitationShare(MOCK_INVITATION_IDS.closedGroup), {
      code: 'GROUP_CLOSED',
    });
  });

  it('CA-005-18: getReminderShare trae el celular del miembro y el texto del cobro', async () => {
    const share = await settle(getReminderShare('c1'));
    expect(share.phone).toMatch(/^\+591\d{8}$/);
    expect(share.text).toMatch(/Bs \d+,\d{2}/);
    await expectRejection(getReminderShare(MOCK_INVITATION_IDS.notCollectableCharge), {
      details: { code: 'CHARGE_NOT_COLLECTABLE' },
    });
  });
});
