/**
 * E2E de `/ingresar` y el cierre de sesión (spec 003 T030; CA-003-04).
 *
 * Usa un usuario del seed de desarrollo (`npm run seed:dev-users -w backend`). La contraseña
 * sale de `SEED_DEV_PASSWORD` del entorno y nunca se escribe aquí.
 */
import { expect, test } from '@playwright/test';

const EMAIL = 'titular@dev.vaquita';
const PASSWORD = process.env.SEED_DEV_PASSWORD ?? '';

test.describe('ingreso y cierre de sesión', () => {
  test.skip(!PASSWORD, 'Falta SEED_DEV_PASSWORD en el entorno');

  test('CA-003-04: la cookie de sesión es httpOnly y document.cookie no la lista', async ({
    page,
    context,
  }) => {
    await page.goto('/ingresar');
    await page.getByLabel('Correo').fill(EMAIL);
    await page.getByLabel('Contraseña').fill(PASSWORD);
    await page.getByRole('button', { name: 'Ingresar' }).click();
    await expect(page).not.toHaveURL(/\/ingresar/);

    const cookies = await context.cookies();
    const session = cookies.find((cookie) => cookie.name === 'vq_session');
    expect(session, 'la cookie vq_session debe existir').toBeDefined();
    expect(session!.httpOnly).toBe(true);

    const visibleToScript = await page.evaluate(() => document.cookie);
    expect(visibleToScript).not.toContain('vq_session');
  });

  test('RF-003-07: cerrar sesión borra la cookie y /perfil vuelve a pedir ingreso', async ({
    page,
    context,
  }) => {
    await page.goto('/ingresar');
    await page.getByLabel('Correo').fill(EMAIL);
    await page.getByLabel('Contraseña').fill(PASSWORD);
    await page.getByRole('button', { name: 'Ingresar' }).click();
    await expect(page).not.toHaveURL(/\/ingresar/);

    await page.goto('/perfil');
    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await expect(page).toHaveURL(/\/ingresar/);

    const cookies = await context.cookies();
    expect(cookies.find((cookie) => cookie.name === 'vq_session')).toBeUndefined();

    await page.goto('/perfil');
    await expect(page).toHaveURL(/\/ingresar/);
  });
});
