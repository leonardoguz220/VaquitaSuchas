import { getInvitationShare, getReminderShare, sendInvitation } from './invitations';
import * as mock from './invitations.mock';
import { MOCK_INVITATION_IDS, resetInvitationsMock } from './invitations.mock';
import { ApiError, apiRequest } from './http';

jest.mock('./http', () => ({ ...jest.requireActual('./http'), apiRequest: jest.fn() }));

const mockedRequest = jest.mocked(apiRequest);

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

describe('services/invitations conectado al backend (contrato 005, parte B)', () => {
  beforeEach(() => {
    mockedRequest.mockReset();
    mockedRequest.mockResolvedValue({} as never);
  });

  it('CA-005-14: sendInvitation envía el correo con POST /api/groups/:id/invitations', async () => {
    await sendInvitation('g 1', 'ana@example.com');
    expect(mockedRequest).toHaveBeenLastCalledWith('/api/groups/g%201/invitations', {
      method: 'POST',
      body: { email: 'ana@example.com' },
    });
  });

  it('CA-005-16: deja pasar el 429 RATE_LIMITED del servidor', async () => {
    const limited = new ApiError(429, 'RATE_LIMITED', 'x', { retryAfterSeconds: 1800 });
    mockedRequest.mockRejectedValueOnce(limited);
    await expect(sendInvitation('g1', 'once@example.com')).rejects.toBe(limited);
  });

  it('CA-005-17: getInvitationShare pide GET /api/groups/:id/invitation-share', async () => {
    await getInvitationShare('g1');
    expect(mockedRequest).toHaveBeenLastCalledWith('/api/groups/g1/invitation-share');
  });

  it('CA-005-18: getReminderShare pide GET /api/charges/:id/reminder-share', async () => {
    await getReminderShare('c1');
    expect(mockedRequest).toHaveBeenLastCalledWith('/api/charges/c1/reminder-share');
  });
});

describe('datos simulados de invitations.mock (contrato 005, parte B)', () => {
  it('CA-005-14: sendInvitation responde 202 pendiente con un correo válido', async () => {
    await expect(settle(mock.sendInvitation('g1', 'ana@example.com'))).resolves.toEqual({
      status: 'pendiente',
    });
    await expectRejection(mock.sendInvitation('g1', 'no-es-correo'), { code: 'VALIDATION_ERROR' });
  });

  it('CA-005-16: la invitación número 11 en una hora responde 429 RATE_LIMITED', async () => {
    for (let index = 0; index < 10; index += 1) {
      await settle(mock.sendInvitation('g1', `p${index}@example.com`));
    }
    await expectRejection(mock.sendInvitation('g1', 'once@example.com'), {
      statusCode: 429,
      code: 'RATE_LIMITED',
      details: { retryAfterSeconds: expect.any(Number) },
    });
  });

  it('CA-005-17: getInvitationShare trae el enlace de invitación y el texto para WhatsApp', async () => {
    const share = await settle(mock.getInvitationShare('g1'));
    expect(share.inviteUrl).toContain('/unirse?codigo=');
    expect(share.text).toContain(share.inviteUrl);
    await expectRejection(mock.getInvitationShare(MOCK_INVITATION_IDS.closedGroup), {
      code: 'GROUP_CLOSED',
    });
  });

  it('CA-005-18: getReminderShare trae el celular del miembro y el texto del cobro', async () => {
    const share = await settle(mock.getReminderShare('c1'));
    expect(share.phone).toMatch(/^\+591\d{8}$/);
    expect(share.text).toMatch(/Bs \d+,\d{2}/);
    await expectRejection(mock.getReminderShare(MOCK_INVITATION_IDS.notCollectableCharge), {
      details: { code: 'CHARGE_NOT_COLLECTABLE' },
    });
  });
});
