/**
 * E2E de los gráficos del panel (spec 006 T019; CA-006-12). La API se simula con `page.route`
 * (ver `panel-fixtures.ts`), así que no hace falta el backend.
 */
import { expect, test } from '@playwright/test';
import { CHARTS, SUMMARY_WITH_DATA, mockPanelApi, signInForPanel } from './panel-fixtures';

test.describe('panel: gráficos', () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await signInForPanel(context, baseURL ?? 'http://localhost:3000');
  });

  test('CA-006-12: «Ver tabla» muestra los mismos valores que el gráfico', async ({ page }) => {
    await mockPanelApi(page, SUMMARY_WITH_DATA, CHARTS);
    await page.goto('/panel');

    const section = page.getByRole('region', { name: 'Tu gasto de los últimos 12 meses' });
    await expect(section).toBeVisible();

    const toggle = section.getByRole('button', { name: 'Ver tabla' });
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');

    const table = section.getByRole('table', { name: 'Gasto de los últimos 12 meses' });
    await expect(table).toBeVisible();
    // Una fila de cabecera y una por mes de la serie, con los centavos de la API formateados.
    await expect(table.getByRole('row')).toHaveCount(CHARTS.monthly.length + 1);
    await expect(table).toContainText('Bs 55,50');
    await expect(table).toContainText('Bs 30,00');
  });
});
