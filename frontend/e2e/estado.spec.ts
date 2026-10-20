/**
 * E2E de `/estado` (T040; CA-000-10 en local, CA-000-14 en staging con T052).
 *
 * La suite se corre dos veces, una por modo, según `E2E_BACKEND`:
 *
 * - `E2E_BACKEND=up` (por defecto): backend y base arriba. Las tres tarjetas muestran «OK».
 * - `E2E_BACKEND=down`: el frontend apunta a un backend que no existe. Se ve el aviso
 *   «No se pudo contactar con el servidor.» y Backend «Sin respuesta», nunca la pantalla en
 *   blanco. No se usa `page.route`: el camino es real (navegador → proxy `/api` → nada).
 *
 * Pasos en local (Git Bash, desde la raíz del repositorio):
 *
 *   1. Base: `npm run db:up` (o `DB_PORT=5435 npm run db:up`) y
 *      `DATABASE_URL=postgres://vaquita:vaquita@localhost:5435/vaquita npm run db:migrate`.
 *   2. Backend en :3001 con las variables de `backend/.env.example` (o su `.env`):
 *      `npm run dev -w backend`; comprobar con `curl -s localhost:3001/health`.
 *   3. Modo up, desde `frontend/`:
 *      `BACKEND_URL=http://localhost:3001 npx next dev --webpack -p 3030` y en otra terminal
 *      `BASE_URL=http://localhost:3030 E2E_BACKEND=up npx playwright test e2e/estado.spec.ts`.
 *   4. Modo down: reiniciar el frontend con `BACKEND_URL=http://localhost:3999` (puerto sin
 *      nada) y correr `BASE_URL=http://localhost:3030 E2E_BACKEND=down npx playwright test e2e/estado.spec.ts`.
 *
 * Staging (T052): `BASE_URL=https://<frontend-staging> E2E_BACKEND=up npx playwright test e2e/estado.spec.ts`.
 * Capturas opcionales: `E2E_SHOTS_DIR=<carpeta>` guarda `estado-360-ok.png`,
 * `estado-1280-ok.png` y `estado-360-sin-backend.png` (solo en el proyecto `chromium`).
 */
import path from 'node:path';
import { expect, test, type Page, type TestInfo } from '@playwright/test';

const BACKEND_MODE = process.env.E2E_BACKEND === 'down' ? 'down' : 'up';
const SHOTS_DIR = process.env.E2E_SHOTS_DIR;
const UNREACHABLE = 'No se pudo contactar con el servidor.';

/** Más que los 5 s del cliente, para que el aviso aparezca aunque el proxy tarde. */
const STATUS_TIMEOUT_MS = 15_000;

function card(page: Page, name: string) {
  return page.getByRole('region', { name });
}

async function screenshot(page: Page, testInfo: TestInfo, width: number, file: string) {
  if (!SHOTS_DIR || testInfo.project.name !== 'chromium') return;
  await page.setViewportSize({ width, height: 900 });
  await page.screenshot({ path: path.join(SHOTS_DIR, file), fullPage: true });
}

test.describe('/estado con backend y base arriba', () => {
  test.skip(BACKEND_MODE !== 'up', 'Solo con E2E_BACKEND=up');

  test('CA-000-10 / CA-000-14: las tres tarjetas muestran OK a través del proxy', async ({
    page,
  }, testInfo) => {
    await page.goto('/estado');

    await expect(page).toHaveTitle(/Estado del sistema/);
    await expect(page.getByRole('heading', { level: 1, name: 'Estado del sistema' })).toBeVisible();
    for (const name of ['Frontend', 'Backend', 'Base de datos']) {
      await expect(card(page, name).getByText('OK', { exact: true })).toBeVisible({
        timeout: STATUS_TIMEOUT_MS,
      });
    }
    await expect(card(page, 'Backend').getByText(/Versión \S+/)).toBeVisible();
    await expect(card(page, 'Base de datos').getByText(/Respondió/)).toBeVisible();
    await expect(page.getByText(/Hora del servidor:/)).toBeVisible();
    await expect(page.getByText(UNREACHABLE)).toHaveCount(0);

    await screenshot(page, testInfo, 360, 'estado-360-ok.png');
    await screenshot(page, testInfo, 1280, 'estado-1280-ok.png');
  });
});

test.describe('/estado con el backend apagado', () => {
  test.skip(BACKEND_MODE !== 'down', 'Solo con E2E_BACKEND=down');

  test('CA-000-10: muestra el aviso de conexión y Backend "Sin respuesta", sin pantalla en blanco', async ({
    page,
  }, testInfo) => {
    await page.goto('/estado');

    const alert = page.getByRole('alert').filter({ hasText: UNREACHABLE });
    await expect(alert).toBeVisible({ timeout: STATUS_TIMEOUT_MS });
    await expect(alert.getByRole('button', { name: 'Reintentar' })).toBeEnabled();
    await expect(card(page, 'Frontend').getByText('OK', { exact: true })).toBeVisible();
    await expect(card(page, 'Backend').getByText('Sin respuesta', { exact: true })).toBeVisible();
    await expect(
      card(page, 'Base de datos').getByText('Sin respuesta', { exact: true }),
    ).toBeVisible();

    await alert.getByRole('button', { name: 'Reintentar' }).click();
    await expect(alert).toBeVisible({ timeout: STATUS_TIMEOUT_MS });

    await screenshot(page, testInfo, 360, 'estado-360-sin-backend.png');
  });
});
