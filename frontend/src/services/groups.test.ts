import {
  createGroup,
  getHostEligibility,
  quoteGroup,
  updateGroup,
  updatePaymentInfo,
} from './groups';
import { MOCK_GROUP, MOCK_GROUPS, MOCK_INVITE_CODE, resetMockGroups } from './groups.mock';

beforeEach(() => {
  jest.useFakeTimers();
  resetMockGroups();
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

describe('services/groups con datos simulados (T016, contrato 001)', () => {
  it('CA-001-25: GET /users/me/host-eligibility responde con la forma del contrato', async () => {
    expect(await settle(getHostEligibility())).toMatchObject({
      eligible: true,
      canCreateMore: true,
      requirement: { minStars: 4.5, minConsideredCharges: 6, windowMonths: 12 },
    });
  });

  it('CA-001-01: POST /groups/quote devuelve respuestas predefinidas, sin calcular', async () => {
    const quote = await settle(
      quoteGroup({ priceCents: 1466, currency: 'USD', exchangeRate: '6.9600', memberCount: 4 }),
    );
    expect(quote).toEqual({
      totalBsCents: 10203,
      baseShareCents: 2550,
      ownerShareCents: 2553,
      remainderCents: 3,
    });
  });

  it('CA-001-01: POST /groups devuelve el GroupDetail con un código de 8 caracteres', async () => {
    const group = await settle(
      createGroup({
        catalogPlanSlug: null,
        customServiceName: 'Canva Pro',
        name: 'Diseño',
        priceCents: 6000,
        currency: 'BS',
        billingDay: 5,
        totalSlots: 4,
        paymentInfoText: null,
      }),
    );
    expect(group.inviteCode).toBe(MOCK_INVITE_CODE);
    expect(group.inviteCode).toMatch(/^[A-Z0-9]{8}$/);
    expect(group).toMatchObject({ name: 'Diseño', myRole: 'titular', exchangeRate: null });
    expect(group.service).toMatchObject({ name: 'Canva Pro', isCustom: true, planName: null });
  });

  it('CA-001-02: POST /groups con USD sin tipo de cambio responde 400 VALIDATION_ERROR', async () => {
    await expectRejection(
      createGroup({
        catalogPlanSlug: 'netflix-premium',
        customServiceName: null,
        name: 'N',
        priceCents: 2299,
        currency: 'USD',
        billingDay: 1,
        totalSlots: 4,
        paymentInfoText: null,
      }),
      {
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        details: { fields: { exchangeRate: ['REQUIRED'] } },
      },
    );
  });

  it('RF-001-19: expone el resto de endpoints de la spec 001 (T020, T025)', async () => {
    expect((await settle(updateGroup(MOCK_GROUP.id, { name: 'Nuevo' }))).name).toBe('Nuevo');
    expect((await settle(updatePaymentInfo(MOCK_GROUP.id, { text: 'Banco' }))).paymentInfo).toEqual(
      { text: 'Banco', qrUrl: null, configured: true },
    );
  });

  it('RF-001-09: PATCH cambia acceptingMembers y sube version; una version vieja da 409', async () => {
    const updated = await settle(
      updateGroup(MOCK_GROUP.id, { acceptingMembers: false, version: MOCK_GROUP.version }),
    );
    expect(updated.entryWindow.acceptingMembers).toBe(false);
    expect(updated.version).toBe(MOCK_GROUP.version + 1);
    await expectRejection(
      updateGroup(MOCK_GROUP.id, { acceptingMembers: true, version: MOCK_GROUP.version }),
      { statusCode: 409, code: 'STALE_STATE' },
    );
  });

  it('CA-001-11: un miembro recibe 403 al cambiar la recepción', async () => {
    const memberId = MOCK_GROUPS.find(({ detail }) => detail.myRole === 'miembro')!.detail.id;
    await expectRejection(updateGroup(memberId, { acceptingMembers: false }), {
      statusCode: 403,
      code: 'FORBIDDEN',
    });
  });

  it('cancela la petición con AbortSignal', async () => {
    const controller = new AbortController();
    const promise = getHostEligibility({ signal: controller.signal });
    controller.abort();
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
  });
});
