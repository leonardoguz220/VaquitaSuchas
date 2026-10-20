/**
 * E2E de grupos (spec 001 T021 y T037; CA-001-20).
 *
 * Usa el titular y los miembros del seed de desarrollo (`npm run seed:dev-users -w backend`) y lo
 * habilitado como titular por `database/seeds/0090_admin_dev.sql`. La contraseña sale de
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

/** Crea un grupo Netflix estándar y devuelve su nombre y su código de invitación. */
async function createGroup(page: Page) {
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
  const code = (await page.getByTestId('invite-code').textContent())?.trim() ?? '';
  expect(code).toHaveLength(8);
  await page.getByRole('link', { name: 'Ver el grupo' }).click();
  // Excluye `/grupos/nuevo`: la URL de detalle es la del id, no la del formulario.
  await expect(page).toHaveURL(/\/grupos\/(?!nuevo$)[^/]+$/);
  return { name, code, groupUrl: page.url() };
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
    const { groupUrl } = await createGroup(page);

    await page.getByRole('tab', { name: 'Ajustes' }).click();
    await page.getByRole('button', { name: 'Cerrar grupo' }).click();
    await page.getByRole('button', { name: 'Sí, cerrar grupo' }).click();

    await expect(page.getByText('Grupo cerrado: solo lectura')).toBeVisible();
    expect(groupUrl).toMatch(/\/grupos\/[^/]+$/);
  });

  // El seed de desarrollo habilita a miembro1 como titular (database/seeds/0090_admin_dev.sql),
  // así que la transferencia pasa la regla de elegibilidad (RF-001-21).
  test('crear → transferir → cerrar: el nuevo titular cierra el grupo (CA-001-13)', async ({
    page,
    browser,
  }) => {
    // El titular crea el grupo; el miembro entra por código y el titular registra su pago en
    // efectivo, lo que lo deja activo y lo hace candidato a nuevo titular.
    await login(page, 'titular@dev.vaquita');
    const { code, groupUrl } = await createGroup(page);

    const memberContext = await browser.newContext();
    const member = await memberContext.newPage();
    await login(member, 'miembro1@dev.vaquita');
    await member.goto('/unirse');
    await member.getByLabel('Código de invitación (8 caracteres)').fill(code);
    await member.getByRole('button', { name: 'Abrir solicitud' }).click();
    await member.getByRole('link', { name: 'Ir a la solicitud y al chat' }).click();
    await expect(member).toHaveURL(/\/solicitudes\/[^/]+$/);

    await page.goto(groupUrl);
    await page.getByRole('tab', { name: 'Solicitudes' }).click();
    await page.locator('a[href*="/solicitudes/"]').first().click();
    // El pago en efectivo solo se acepta cuando la solicitud está en `esperando_pago`, es decir,
    // después de que el titular envía los datos de pago (RF-010-11).
    await page.getByRole('button', { name: 'Enviar datos de pago' }).click();
    // El grupo de prueba no tiene datos de pago guardados (RF-001-20): se usan datos de la solicitud.
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Otros datos solo para esta solicitud').check();
    await dialog.getByLabel('Datos de pago (opcional si subes un QR)').fill('Cuenta de prueba E2E');
    await dialog.getByRole('button', { name: 'Enviar datos de pago' }).click();
    await expect(page.getByRole('button', { name: 'Pago en efectivo' })).toBeVisible();
    await page.getByRole('button', { name: 'Pago en efectivo' }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Registrar pago en efectivo' })
      .click();
    await expect(page.getByText(/Registraste el pago en efectivo/)).toBeVisible();

    await page.goto(groupUrl);
    await page.getByRole('tab', { name: 'Ajustes' }).click();
    // Índice 0 es el placeholder; el 1 es el miembro activo recién aceptado.
    await page.getByLabel('Nuevo titular').selectOption({ index: 1 });
    await page.getByRole('button', { name: 'Transferir titularidad' }).click();
    await page.getByRole('button', { name: 'Sí, transferir' }).click();

    await member.goto(groupUrl);
    await member.getByRole('tab', { name: 'Ajustes' }).click();
    await member.getByRole('button', { name: 'Cerrar grupo' }).click();
    await member.getByRole('button', { name: 'Sí, cerrar grupo' }).click();
    await expect(member.getByText('Grupo cerrado: solo lectura')).toBeVisible();

    await memberContext.close();
  });
});
