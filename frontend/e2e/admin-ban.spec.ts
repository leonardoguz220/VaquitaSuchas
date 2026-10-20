/**
 * E2E de baneo desde el panel de administración (spec 009 T018; CA-009-31). El administrador
 * banea a un miembro del seed, comprueba que ya no puede entrar y revierte el baneo. El baneo se
 * revierte aunque una aserción falle, para no dejar la cuenta del seed bloqueada.
 */
import { expect, test, type Page } from '@playwright/test';

const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? '';
const PASSWORD = process.env.SEED_DEV_PASSWORD ?? '';
const TARGET = 'miembro3@dev.vaquita';
const REASON = 'Prueba E2E de baneo y reversión';

async function login(page: Page, email: string, password: string) {
  await page.goto('/ingresar');
  await page.getByLabel('Correo').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Ingresar' }).click();
}

/** Abre la ficha del usuario objetivo desde el buscador de `/admin/usuarios`. */
async function openTargetFile(page: Page) {
  await page.goto('/admin/usuarios');
  await page.getByLabel('Buscar').fill(TARGET);
  // Espera al resultado filtrado: antes de filtrar la lista muestra a todos los usuarios.
  const row = page.getByRole('list', { name: 'Lista de usuarios' }).getByRole('link', {
    name: /Miembro Tres/,
  });
  await expect(row).toBeVisible();
  await row.click();
  await expect(page.getByRole('heading', { name: /Miembro Tres/ })).toBeVisible();
}

test.describe('administración: baneo', () => {
  test.skip(!PASSWORD || !ADMIN_PASSWORD, 'Faltan SEED_DEV_PASSWORD o SEED_ADMIN_PASSWORD');
  test.setTimeout(120_000);

  // Pendiente: revertir un baneo exige a un administrador distinto del que lo aplicó (spec 009,
  // T015), y el seed de desarrollo solo tiene uno. Sin esa reversión el test dejaría bloqueada la
  // cuenta del seed; se activa cuando haya un segundo administrador.
  test.fixme('CA-009-31: el administrador banea a un miembro, no puede entrar y se revierte el baneo', async ({
    browser,
  }) => {
    const adminContext = await browser.newContext();
    const admin = await adminContext.newPage();
    await login(admin, 'admin@dev.vaquita', ADMIN_PASSWORD);
    await expect(admin).not.toHaveURL(/\/ingresar/);

    let banned = false;
    try {
      await openTargetFile(admin);
      await admin.getByRole('button', { name: 'Banear', exact: true }).click();
      await admin.getByLabel(/Motivo/).fill(REASON);
      await admin.getByRole('dialog').getByRole('button', { name: 'Banear', exact: true }).click();
      await expect(admin.getByText('La cuenta quedó baneada.')).toBeVisible();
      banned = true;

      // El miembro baneado no puede entrar: el mensaje es el mismo que para una contraseña errónea.
      const memberContext = await browser.newContext();
      const member = await memberContext.newPage();
      await login(member, TARGET, PASSWORD);
      await expect(member.getByText('Correo o contraseña incorrectos.')).toBeVisible();
      await expect(member).toHaveURL(/\/ingresar/);
      await memberContext.close();
    } finally {
      if (banned) {
        await openTargetFile(admin);
        await admin.getByRole('button', { name: 'Revertir baneo', exact: true }).click();
        await admin.getByLabel(/Motivo/).fill(REASON);
        await admin
          .getByRole('dialog')
          .getByRole('button', { name: 'Revertir baneo', exact: true })
          .click();
        await expect(admin.getByText('El baneo fue revertido.')).toBeVisible();
      }
      await adminContext.close();
    }
  });
});
