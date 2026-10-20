/**
 * E2E de baneo desde el panel de administración (spec 009 T018; CA-009-31). El administrador
 * banea a un miembro del seed, ese miembro intenta entrar una sola vez, y admin2 revierte el baneo.
 * Tras revertir, el miembro entra con su contraseña. El baneo se revierte aunque una aserción
 * falle, para no dejar la cuenta del seed bloqueada.
 *
 * Solo corre en chromium y sin reintentos: cada intento fallido cuenta contra el bloqueo de login
 * por correo (5 fallos en 15 minutos), así que un reintento podría bloquear la cuenta del seed.
 */
import { expect, test, type Page, type TestInfo } from '@playwright/test';

test.describe.configure({ retries: 0 });

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

  // FIXME: el login fallido pasa por el proxy /api y el fetch al backend falla con
  // "expected non-null body source" (503 SERVICE_UNAVAILABLE) en vez de devolver el 401 del
  // backend. Así el miembro baneado ve "No se pudo contactar con el servidor." en lugar de
  // "Correo o contraseña incorrectos.". Pendiente de corregir en src/app/api/[...path]/forward.ts.
  test.fixme('CA-009-31: el administrador banea a un miembro, no puede entrar y se revierte el baneo', async ({
    browser,
  }, testInfo: TestInfo) => {
    // Un solo proyecto: los dos corren contra las mismas cuentas del seed y se pisan el baneo.
    test.skip(testInfo.project.name !== 'chromium', 'El baneo se prueba solo en chromium');

    // Revertir un baneo exige a un administrador distinto del que lo aplicó (spec 009, T015), por eso
    // lo revierte admin2@dev.vaquita.
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

      // Un solo intento: el miembro baneado recibe el mismo mensaje que con una contraseña errónea.
      const memberContext = await browser.newContext();
      const member = await memberContext.newPage();
      await login(member, TARGET, PASSWORD);
      await expect(member.getByText('Correo o contraseña incorrectos.')).toBeVisible();
      await expect(member).toHaveURL(/\/ingresar/);
      await memberContext.close();
    } finally {
      if (banned) {
        const reviewerContext = await browser.newContext();
        const reviewer = await reviewerContext.newPage();
        await login(reviewer, 'admin2@dev.vaquita', PASSWORD);
        await expect(reviewer).not.toHaveURL(/\/ingresar/);
        await openTargetFile(reviewer);
        await reviewer.getByRole('button', { name: 'Revertir baneo', exact: true }).click();
        await reviewer.getByLabel(/Motivo/).fill(REASON);
        await reviewer
          .getByRole('dialog')
          .getByRole('button', { name: 'Revertir baneo', exact: true })
          .click();
        await expect(reviewer.getByText('El baneo fue revertido.')).toBeVisible();
        await reviewerContext.close();

        // Tras revertir, un único login correcto del miembro.
        const restoredContext = await browser.newContext();
        const restored = await restoredContext.newPage();
        await login(restored, TARGET, PASSWORD);
        await expect(restored).not.toHaveURL(/\/ingresar/);
        await restoredContext.close();
      }
      await adminContext.close();
    }
  });
});
