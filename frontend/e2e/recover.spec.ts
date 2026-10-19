/**
 * E2E de la recuperación de contraseña (spec 003 T036; CA-003-09, CA-003-11, CA-003-12).
 *
 * El correo registrado y el no registrado deben mostrar el mismo aviso. Un token inválido
 * muestra el aviso de enlace vencido con «Pedir otro enlace».
 */
import { expect, test } from '@playwright/test';

const REGISTERED_EMAIL = 'titular@dev.vaquita';
const SENT_MESSAGE = 'Si el correo está registrado, recibirás un enlace en unos minutos.';
const EXPIRED_MESSAGE = 'Este enlace venció o ya se usó. Pide uno nuevo.';

async function requestRecovery(page: import('@playwright/test').Page, email: string) {
  await page.goto('/recuperar');
  await page.getByLabel('Correo').fill(email);
  await page.getByRole('button', { name: 'Enviarme el enlace' }).click();
  await expect(page.getByText(SENT_MESSAGE)).toBeVisible();
}

test.describe('recuperación de contraseña', () => {
  test('CA-003-09: pedir recuperación muestra el mismo aviso con correo registrado o no', async ({
    page,
  }) => {
    const unknown = `nadie-${Date.now()}@example.com`;
    await requestRecovery(page, unknown);
    await requestRecovery(page, REGISTERED_EMAIL);
  });

  test('CA-003-12: un token inválido muestra el aviso de enlace vencido y pedir otro', async ({
    page,
  }) => {
    await page.goto('/recuperar/token-que-no-existe-000000');
    await page.getByRole('textbox', { name: 'Nueva contraseña', exact: true }).fill('ClaveNueva2026');
    await page.getByRole('textbox', { name: 'Confirma la contraseña', exact: true }).fill('ClaveNueva2026');
    await page.getByRole('button', { name: 'Guardar contraseña' }).click();

    await expect(page.getByText(EXPIRED_MESSAGE)).toBeVisible();
    await page.getByRole('link', { name: 'Pedir otro enlace' }).click();
    await expect(page).toHaveURL(/\/recuperar$/);
  });
});
