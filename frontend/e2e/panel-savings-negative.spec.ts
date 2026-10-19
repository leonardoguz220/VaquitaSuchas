/**
 * E2E del ahorro negativo en el panel (spec 006 T018; CA-006-21). La API se simula en el
 * navegador (`support/panel-api.ts`):
 *
 *   BASE_URL=http://localhost:3000 npx playwright test e2e/panel-savings-negative.spec.ts
 */
import { expect, test } from '@playwright/test';
import { addTestSession, chartsFixture, dashboardFixture, mockPanelApi } from './support/panel-api';

const NOTE = 'Compartir este plan te sale más caro que el plan individual.';

test('CA-006-21: el ahorro negativo se muestra con signo menos y con la nota explicativa', async ({
  context,
  page,
  baseURL,
}) => {
  await addTestSession(context, baseURL ?? 'http://localhost:3000');
  const base = dashboardFixture();
  await mockPanelApi(page, {
    dashboard: dashboardFixture({
      savings: {
        ...(base.savings as Record<string, unknown>),
        totalCents: -1250,
        lines: [
          {
            groupId: 'g2',
            serviceName: 'Spotify',
            role: 'miembro',
            individualPriceBsCents: 1750,
            shareCents: 3000,
            savingsCents: -1250,
          },
        ],
        negativeNote: NOTE,
      },
    }),
    charts: {
      ...chartsFixture,
      savings: [{ period: '2026-10', savingsCents: -1250, cumulativeCents: -1250 }],
    },
  });

  await page.goto('/panel');
  const tile = page.getByRole('region', { name: 'Ahorro estimado' });
  await expect(tile.getByText('−Bs 12,50').first()).toBeVisible();
  await expect(tile.getByText(NOTE)).toBeVisible();

  const chart = page.getByRole('region', { name: 'Ahorro acumulado' });
  await expect(chart.locator('.recharts-label-list text').first()).toHaveText(/−Bs\s*12,50/);
  await chart.getByRole('button', { name: 'Ver tabla' }).click();
  await expect(chart.getByRole('cell', { name: '−Bs 12,50' })).toHaveCount(2);
});
