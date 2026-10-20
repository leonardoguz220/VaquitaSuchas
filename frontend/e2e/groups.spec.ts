/**
 * E2E de grupos (spec 001 T021 y T037; CA-001-20).
 *
 * Usa el titular del seed de desarrollo (`npm run seed:dev-users -w backend`) y lo habilitado
 * como titular por `database/seeds/0090_admin_dev.sql`. La contraseña sale de
 * `SEED_DEV_PASSWORD` del entorno y nunca se escribe aquí.
 */
import { expect, test, type Page } from '@playwright/test';

const PASSWORD = process.env.SEED_DEV_PASSWORD ?? '';

async function login(page: Page, email: string) {
  await page.goto('/ingresar');
  await page.getByLabel('Correo').fill(email);
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page).not.toHaveURL(/\/ingresar/);
}

test.describe('grupos', () => {
  test.skip(!PASSWORD, 'Falta SEED_DEV_PASSWORD en el entorno');

  test('CA-001-20: Mis suscripciones muestra solo mis grupos, con mi rol y mi cuota', async ({
    page,
  }) => {
    await login(page, 'titular@dev.vaquita');
    await page.goto('/grupos');
    await expect(page.getByText('Mis suscripciones', { exact: true })).toBeVisible();

    const quotas = page.getByText('Cuota de referencia');
    await expect(quotas.first()).toBeVisible();
    const count = await quotas.count();
    // El titular es dueño de cada grupo listado: cada tarjeta muestra su rol y su cuota.
    await expect(page.getByText('Titular', { exact: true })).toHaveCount(count);
    await expect(page.getByText('Soy miembro', { exact: true })).toBeVisible();
  });

  test('crear → cerrar: el titular crea el grupo y lo cierra desde Ajustes', async ({ page }) => {
    await login(page, 'titular@dev.vaquita');
    await page.goto('/grupos/nuevo');
    await page
      .getByRole('button', { name: /Netflix/ })
      .first()
      .click();
    await page.getByRole('radio', { name: /Estándar/ }).check();
    await page.getByRole('button', { name: 'Siguiente: datos del grupo' }).click();

    const name = `Grupo E2E ${Date.now().toString().slice(-6)}`;
    await page.getByLabel('Nombre del grupo').fill(name);
    await page.getByLabel('Tipo de cambio (Bs por USD)').fill('6.96');
    await page.getByRole('button', { name: 'Crear suscripción' }).click();

    await expect(page.getByText(`¡Listo! Creaste «${name}»`)).toBeVisible();
    await expect(page.getByText('Código de invitación')).toBeVisible();

    await page.getByRole('link', { name: 'Ver el grupo' }).click();
    await expect(page).toHaveURL(/\/grupos\/[^/]+$/);
    await page.getByRole('tab', { name: 'Ajustes' }).click();
    await page.getByRole('button', { name: 'Cerrar grupo' }).click();
    await page.getByRole('button', { name: 'Sí, cerrar grupo' }).click();

    await expect(page.getByText('Grupo cerrado: solo lectura')).toBeVisible();
  });

  // Transferir y cerrar necesitan un miembro activo en el grupo. Hoy un miembro entra por
  // código solo con una solicitud: el titular le envía datos de pago, el miembro tiene 15 min
  // para pagar y el titular confirma el ingreso. Ese ciclo no se puede completar en un E2E sin
  // un atajo de prueba en el backend, así que este caso queda pendiente.
  test.fixme('crear → transferir → cerrar: el nuevo titular cierra el grupo', async () => {});
});
