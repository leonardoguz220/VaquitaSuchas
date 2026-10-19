/**
 * E2E de los gráficos del panel (spec 006 T018; CA-006-12). La API se simula en el navegador
 * (`support/panel-api.ts`); basta con el frontend en marcha:
 *
 *   BASE_URL=http://localhost:3000 npx playwright test e2e/panel-charts.spec.ts
 */
import { expect, test, type Locator } from '@playwright/test';
import { addTestSession, chartsFixture, dashboardFixture, mockPanelApi } from './support/panel-api';

/** Etiquetas de valor dibujadas por Recharts (texto de cada `<text>` de etiqueta). */
async function barLabels(card: Locator): Promise<string[]> {
  const labels = card.locator('.recharts-label-list text');
  await expect(labels.first()).toBeVisible();
  // Recharts puede partir el texto en `<tspan>`: se unen con un espacio.
  return labels.evaluateAll((elements) =>
    elements.map((element) => {
      const lines = Array.from(element.querySelectorAll('tspan'), (line) => line.textContent);
      return (lines.length > 0 ? lines.join(' ') : (element.textContent ?? '')).trim();
    }),
  );
}

/** Valores de una columna de la tabla alternativa. */
async function columnValues(card: Locator, column: number): Promise<string[]> {
  const cells = card.locator(`tbody tr > :nth-child(${column})`);
  return (await cells.allTextContents()).map((text) => text.trim());
}

test.beforeEach(async ({ context, page, baseURL }) => {
  await addTestSession(context, baseURL ?? 'http://localhost:3000');
  await mockPanelApi(page, { dashboard: dashboardFixture(), charts: chartsFixture });
});

test('CA-006-12: «Ver tabla» del gasto mensual muestra los mismos valores que las barras', async ({
  page,
}) => {
  await page.goto('/panel');
  const card = page.getByRole('region', { name: 'Tu gasto de los últimos 12 meses' });
  const chartValues = await barLabels(card);
  expect(chartValues).toEqual(['Bs 41,90', 'Bs 72,50', 'Bs 55,50']);

  const toggle = card.getByRole('button', { name: 'Ver tabla' });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  expect(await columnValues(card, 2)).toEqual(chartValues);
});

test('CA-006-12: el gráfico por servicio y su tabla coinciden', async ({ page }) => {
  await page.goto('/panel');
  const card = page.getByRole('region', { name: 'Gasto por servicio' });
  const chartValues = await barLabels(card);
  await card.getByRole('button', { name: 'Ver tabla' }).click();
  expect(await columnValues(card, 2)).toEqual(chartValues);
  expect(await columnValues(card, 1)).toEqual(['Spotify', 'Disney+']);
});

test('CA-006-12: el ahorro acumulado y su tabla coinciden', async ({ page }) => {
  await page.goto('/panel');
  const card = page.getByRole('region', { name: 'Ahorro acumulado' });
  const chartValues = await barLabels(card);
  await card.getByRole('button', { name: 'Ver tabla' }).click();
  expect(await columnValues(card, 3)).toEqual(chartValues);
  expect(await columnValues(card, 2)).toEqual(['Sin dato', 'Bs 49,60', 'Bs 49,60']);
});
