/**
 * E2E del ahorro negativo del panel (spec 006 T019; CA-006-21): signo menos y nota explicativa.
 * La API se simula con `page.route` (ver `panel-fixtures.ts`).
 */
import { expect, test } from '@playwright/test';
import { SUMMARY_NEGATIVE_SAVINGS, mockPanelApi, signInForPanel } from './panel-fixtures';

test.describe('panel: ahorro negativo', () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await signInForPanel(context, baseURL ?? 'http://localhost:3000');
  });

  test('CA-006-21: el ahorro negativo lleva signo menos y la nota explicativa', async ({
    page,
  }) => {
    await mockPanelApi(page, SUMMARY_NEGATIVE_SAVINGS);
    await page.goto('/panel');

    // El total de la tarjeta (el primero); la línea por suscripción repite el mismo monto.
    await expect(page.getByText('−Bs 12,00', { exact: true }).first()).toBeVisible();
    await expect(
      page.getByText('Este mes pagas más que el precio individual del servicio.'),
    ).toBeVisible();
  });
});
