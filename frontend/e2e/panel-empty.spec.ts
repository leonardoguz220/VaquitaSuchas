/**
 * E2E del estado vacío del panel (spec 006 T019; CA-006-14): sin grupos, el panel muestra las
 * acciones para crear o unirse. La API se simula con `page.route` (ver `panel-fixtures.ts`).
 */
import { expect, test } from '@playwright/test';
import { SUMMARY_EMPTY, mockPanelApi, signInForPanel } from './panel-fixtures';

test.describe('panel: estado vacío', () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await signInForPanel(context, baseURL ?? 'http://localhost:3000');
  });

  test('CA-006-14: sin grupos ofrece crear un grupo o unirse con un código', async ({ page }) => {
    await mockPanelApi(page, SUMMARY_EMPTY);
    await page.goto('/panel');

    await expect(page.getByRole('heading', { name: 'Aún no tienes suscripciones' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Crear un grupo' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Unirme con un código' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Gráficos' })).toHaveCount(0);
  });
});
