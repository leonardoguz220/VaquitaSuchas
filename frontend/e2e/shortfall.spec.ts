/**
 * E2E del faltante de grupo (spec 011, T016; CA-011-03, CA-011-04): un miembro afectado elige
 * cubrir su parte e informa el pago adicional. La API se simula con `page.route` (como en los
 * E2E del panel): los montos y estados ya vienen calculados, el E2E no calcula nada.
 */
import { expect, test, type Page } from '@playwright/test';
import { signInForPanel } from './panel-fixtures';

const GROUP_ID = '0c5e1f7a-0000-4000-8000-00000000b011';
const ROW_ID = '0c5e1f7a-0000-4000-8000-00000000b012';

const person = { userId: 'u-a', fullName: 'Ana Prueba' };

function row(overrides: object) {
  return {
    id: ROW_ID,
    roundId: 'r-1',
    groupId: GROUP_ID,
    member: person,
    paidCents: 2500,
    extraDueCents: 833,
    choice: 'pendiente',
    extra: {
      status: 'no_aplica',
      method: null,
      reference: null,
      deadlineAt: null,
      rejectReason: null,
    },
    refund: {
      status: 'no_aplica',
      amountCents: null,
      method: null,
      reference: null,
      dueAt: null,
      disputeReason: null,
    },
    version: 1,
    allowedActions: ['cover', 'requestRefund'],
    timeline: [],
    ...overrides,
  };
}

function round(rowValue: object) {
  return {
    id: 'r-1',
    groupId: GROUP_ID,
    period: '2026-11',
    roundNumber: 1,
    status: 'abierta',
    totalBsCents: 10000,
    memberCountAfter: 3,
    baseShareCents: 3333,
    ownerShareCents: 3334,
    shortfallCents: 2500,
    openedAt: '2026-11-01T12:00:00Z',
    respondBy: '2026-11-03T12:00:00Z',
    payBy: '2026-11-05T12:00:00Z',
    closedAt: null,
    version: 1,
    rows: [rowValue],
    allowedActions: [],
  };
}

async function mockShortfallApi(page: Page) {
  let current = row({});
  await page.route(/\/api\//, (route) =>
    route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ statusCode: 404, code: 'NOT_FOUND', message: 'No encontrado' }),
    }),
  );
  await page.route(/\/api\/groups\/[^/]+\/shortfall$/, (route) =>
    route.fulfill({ json: round(current) }),
  );
  await page.route(/\/api\/shortfall-rows\/[^/]+\/respond$/, (route) => {
    current = row({
      choice: 'cubrir',
      version: 2,
      extra: {
        status: 'pendiente_pago',
        method: null,
        reference: null,
        deadlineAt: '2026-11-05T12:00:00Z',
        rejectReason: null,
      },
      allowedActions: ['pay'],
    });
    return route.fulfill({ json: current });
  });
  await page.route(/\/api\/shortfall-rows\/[^/]+\/pay$/, (route) => {
    current = row({
      choice: 'cubrir',
      version: 3,
      extra: {
        status: 'informado',
        method: 'qr',
        reference: 'REF-123',
        deadlineAt: null,
        rejectReason: null,
      },
      allowedActions: [],
    });
    return route.fulfill({ json: current });
  });
}

test.describe('faltante de grupo', () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await signInForPanel(context, baseURL ?? 'http://localhost:3000');
  });

  test('CA-011-03: el miembro elige cubrir su parte e informa su pago', async ({ page }) => {
    await mockShortfallApi(page);
    await page.goto(`/grupos/${GROUP_ID}/faltante`);

    await expect(page.getByRole('heading', { name: 'Ronda de Noviembre 2026' })).toBeVisible();
    await page.getByRole('button', { name: /Cubrir mi parte/ }).click();

    await expect(page.getByText('Pago adicional pendiente')).toBeVisible();
    await page.getByLabel('Referencia de la transacción').fill('REF-123');
    await page.getByRole('button', { name: 'Informar mi pago' }).click();

    await expect(page.getByText('Pago adicional informado')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Informar mi pago' })).toHaveCount(0);
  });
});
