import {
  createGroup,
  getGroup,
  getHostEligibility,
  listGroups,
  quoteGroup,
  regenerateInviteCode,
  updateGroup,
  updatePaymentInfo,
} from './groups';
import { MOCK_GROUP, MOCK_INVITE_CODE } from './groups.mock';

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
    expect((await settle(listGroups())).items).toHaveLength(1);
    expect((await settle(listGroups({ status: 'cerrado' }))).items).toHaveLength(0);
    expect(await settle(getGroup(MOCK_GROUP.id))).toEqual(MOCK_GROUP);
    expect((await settle(updateGroup(MOCK_GROUP.id, { name: 'Nuevo' }))).name).toBe('Nuevo');
    expect((await settle(updatePaymentInfo(MOCK_GROUP.id, { text: 'Banco' }))).paymentInfo).toEqual(
      { text: 'Banco', qrUrl: null, configured: true },
    );
    expect((await settle(regenerateInviteCode(MOCK_GROUP.id))).inviteCode).toMatch(/^[A-Z0-9]{8}$/);
    await expectRejection(getGroup('otro'), { statusCode: 404, code: 'NOT_FOUND' });
  });

  it('cancela la petición con AbortSignal', async () => {
    const controller = new AbortController();
    const promise = getHostEligibility({ signal: controller.signal });
    controller.abort();
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
  });
});
