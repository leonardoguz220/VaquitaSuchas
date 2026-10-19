/**
 * E2E del registro completo con el bot simulado (spec 003 T026; CA-003-27).
 *
 * Paso 1: `/registro` crea la cuenta y muestra el enlace de Telegram. Paso 2: `/dev/telegram`
 * envía `/start` y comparte el contacto como lo haría Telegram. La pantalla de verificación
 * detecta el celular verificado, redirige a `/` y la cuenta queda con sesión.
 */
import { expect, test } from '@playwright/test';

const PASSWORD = 'ClaveSegura2026';

function uniqueDigits(length: number): string {
  let digits = '';
  while (digits.length < length) digits += Math.floor(Math.random() * 10).toString();
  return digits;
}

test.describe('registro con el bot simulado', () => {
  test('CA-003-27: registro completo verifica el celular y deja sesión iniciada', async ({
    page,
    context,
  }) => {
    const email = `e2e-${Date.now()}@example.com`;
    const telegramUserId = `7${uniqueDigits(8)}`;
    const phone = `+5917${uniqueDigits(7)}`;

    await page.goto('/registro');
    await page.getByLabel('Nombre completo').fill('Persona E2E');
    await page.getByLabel('Correo').fill(email);
    await page.getByLabel('Cédula de identidad').fill(uniqueDigits(7));
    await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
    await page.getByLabel('Confirma la contraseña').fill(PASSWORD);
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Continuar a la verificación' }).click();

    await expect(page).toHaveURL(/\/registro\/verificar/);
    const telegramLink = page.getByRole('link', { name: 'Abrir Telegram' });
    await expect(telegramLink).toBeVisible();
    const token = new URL((await telegramLink.getAttribute('href')) ?? '').searchParams.get('start');
    expect(token, 'el enlace de Telegram debe llevar start=<token>').toBeTruthy();

    const bot = await context.newPage();
    await bot.goto('/dev/telegram');
    await bot.getByLabel('Token').fill(token!);
    await bot.getByLabel('ID de Telegram simulado').fill(telegramUserId);
    await bot.getByLabel('ID del contacto').fill(telegramUserId);
    await bot.getByLabel('Celular').fill(phone);
    await bot.getByRole('button', { name: 'Enviar /start' }).click();
    await expect(bot.getByText('Se envió /start al bot.')).toBeVisible();
    await bot.getByRole('button', { name: 'Compartir contacto' }).click();
    await expect(bot.getByText('Se compartió el contacto con el bot.')).toBeVisible();

    // `/` redirige según la sesión: con sesión iniciada llega a `/grupos`.
    await expect(page).toHaveURL(/\/grupos$/, { timeout: 20_000 });

    const cookies = await context.cookies();
    expect(cookies.find((cookie) => cookie.name === 'vq_session')).toBeDefined();
    expect(cookies.find((cookie) => cookie.name === 'vq_reg')).toBeUndefined();
  });
});
