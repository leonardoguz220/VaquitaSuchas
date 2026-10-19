/**
 * E2E del estado vacío del panel (spec 006 T018; CA-006-14, RF-006-16). La API se simula en el
 * navegador (`support/panel-api.ts`):
 *
 *   BASE_URL=http://localhost:3000 npx playwright test e2e/panel-empty.spec.ts
 */
import { expect, test } from '@playwright/test';
import { addTestSession, dashboardFixture, mockPanelApi } from './support/panel-api';

test('CA-006-14: un usuario sin grupos ve el estado vacío con crear y unirse', async ({
  context,
  page,
  baseURL,
}) => {
  await addTestSession(context, baseURL ?? 'http://localhost:3000');
  await mockPanelApi(page, {
    dashboard: dashboardFixture({
      hasGroups: false,
      isEmpty: true,
      availableMonths: [],
      spend: { totalCents: 0, paidCents: 0, lines: [] },
      savings: {
        totalCents: null,
        estimated: true,
        lines: [],
        withoutData: [],
        negativeNote: null,
      },
      debts: { totalCents: 0, count: 0, inReviewCents: 0, inReviewCount: 0 },
    }),
    charts: { monthly: [], byService: [], savings: [] },
  });

  await page.goto('/panel');
  await expect(page.getByRole('heading', { name: 'Aún no tienes suscripciones' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Crear un grupo' })).toHaveAttribute(
    'href',
    '/grupos/nuevo',
  );
  await expect(page.getByRole('link', { name: 'Unirme con un código' })).toHaveAttribute(
    'href',
    '/unirse',
  );
  await expect(page.getByRole('region', { name: 'Gasto del mes' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Gráficos' })).toHaveCount(0);
});
