/**
 * Ayudas de los E2E de cupos libres (spec 008 T016, T020). Cada test crea su propio grupo y su
 * publicación por la app, así que no depende del seed ni de datos de otros tests.
 */
import { expect, type APIRequestContext, type Page } from '@playwright/test';

export const PASSWORD = process.env.SEED_DEV_PASSWORD ?? '';

export async function login(page: Page, email: string) {
  await page.goto('/ingresar');
  await page.getByLabel('Correo').fill(email);
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page).not.toHaveURL(/\/ingresar/);
}

/** Crea un grupo Netflix estándar como titular y devuelve su id (de la URL de detalle). */
export async function createGroup(page: Page): Promise<string> {
  await page.goto('/grupos/nuevo');
  await page
    .getByRole('button', { name: /Netflix/ })
    .first()
    .click();
  await page.getByRole('radio', { name: /Estándar/ }).check();
  await page.getByRole('button', { name: 'Siguiente: datos del grupo' }).click();

  const name = `Cupos E2E ${Date.now().toString().slice(-6)}`;
  await page.getByLabel('Nombre del grupo').fill(name);
  await page.getByLabel('Tipo de cambio (Bs por USD)').fill('6.96');
  await page.getByRole('button', { name: 'Crear suscripción' }).click();

  await expect(page.getByText(`¡Listo! Creaste «${name}»`)).toBeVisible();
  await page.getByRole('link', { name: 'Ver el grupo' }).click();
  await expect(page).toHaveURL(/\/grupos\/(?!nuevo$)[^/]+$/);
  return new URL(page.url()).pathname.split('/').pop() ?? '';
}

/** Publica cupos desde la pestaña del titular con una descripción dada. */
export async function publishListing(page: Page, groupId: string, description: string) {
  await page.goto(`/grupos/${groupId}`);
  await page.getByRole('tab', { name: 'Publicar cupos' }).click();
  await page.getByLabel('Cupos a publicar').fill('1');
  await page.getByLabel('Descripción').fill(description);
  const created = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      response.url().includes(`/groups/${groupId}/listing`),
  );
  await page.getByRole('button', { name: 'Publicar cupos' }).click();
  expect((await created).status(), 'POST /groups/:id/listing debe responder 201').toBe(201);
  await expect(page.getByLabel('Estado de la publicación')).toBeVisible();
}

/** Id de la publicación activa del grupo, leído por el proxy con la sesión del titular. */
export async function listingIdOf(request: APIRequestContext, groupId: string): Promise<string> {
  const response = await request.get(`/api/groups/${groupId}/listing`);
  expect(response.ok(), 'GET /groups/:id/listing debe responder 200').toBeTruthy();
  const body = (await response.json()) as { id: string };
  expect(body.id).toBeTruthy();
  return body.id;
}

/** Cierra el grupo desde Ajustes como lo hace el titular; libera su lugar en el límite de grupos. */
export async function closeGroup(page: Page, groupId: string) {
  await page.goto(`/grupos/${groupId}`);
  await page.getByRole('tab', { name: 'Ajustes' }).click();
  await page.getByRole('button', { name: 'Cerrar grupo' }).click();
  await page.getByRole('button', { name: 'Sí, cerrar grupo' }).click();
  await expect(page.getByText('Grupo cerrado: solo lectura')).toBeVisible();
}
