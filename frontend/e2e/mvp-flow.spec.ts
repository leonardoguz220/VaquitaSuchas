/**
 * E2E del flujo feliz del MVP (spec 002 T043; CA-002-04, CA-002-06).
 *
 * Crear grupo (día de cobro = hoy en America/La_Paz) → invitar (solicitud por código) → pago en
 * efectivo del titular → disparar el tick de tareas → el miembro sube el comprobante → el titular
 * confirma. Usa los usuarios del seed de desarrollo (`npm run seed:dev-users -w backend`).
 * La contraseña y el token del tick salen de `SEED_DEV_PASSWORD` y `JOBS_TOKEN` del entorno y
 * nunca se escriben aquí.
 */
import { expect, test, type Page } from '@playwright/test';

const PASSWORD = process.env.SEED_DEV_PASSWORD ?? '';
const JOBS_TOKEN = process.env.JOBS_TOKEN ?? '';
const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:3001';

// PNG de 1 × 1 píxel: basta para el comprobante de prueba.
const RECEIPT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

/** Día del mes de hoy en America/La_Paz (día de cobro para que el tick genere el cobro). */
function todayInLaPaz(): number {
  const day = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/La_Paz',
    day: 'numeric',
  }).format(new Date());
  return Number(day);
}

async function login(page: Page, email: string) {
  await page.goto('/ingresar');
  await page.getByLabel('Correo').fill(email);
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page).not.toHaveURL(/\/ingresar/);
}

test.describe('flujo feliz del MVP', () => {
  test.skip(!PASSWORD, 'Falta SEED_DEV_PASSWORD en el entorno');
  test.skip(!JOBS_TOKEN, 'Falta JOBS_TOKEN en el entorno');

  // Pendiente: el pago en efectivo del ingreso ya deja pagado el cobro del período actual, y el tick
  // (billing.generate) no genera otro hasta el siguiente vencimiento. Sin cobro pendiente no hay
  // comprobante que subir en el mismo día; hace falta un atajo de prueba en el backend.
  test.fixme('CA-002-04/06: crear → invitar → cobrar → pagar → confirmar', async ({
    page,
    browser,
    request,
  }) => {
    test.setTimeout(180_000);

    // 1. El titular crea el grupo con día de cobro = hoy.
    await login(page, 'titular@dev.vaquita');
    await page.goto('/grupos/nuevo');
    await page
      .getByRole('button', { name: /Netflix/ })
      .first()
      .click();
    await page.getByRole('radio', { name: /Estándar/ }).check();
    await page.getByRole('button', { name: 'Siguiente: datos del grupo' }).click();

    const name = `Grupo MVP ${Date.now().toString().slice(-6)}`;
    await page.getByLabel('Nombre del grupo').fill(name);
    await page.getByLabel('Día de cobro').selectOption(String(todayInLaPaz()));
    await page.getByLabel('Tipo de cambio (Bs por USD)').fill('6.96');
    await page.getByRole('button', { name: 'Crear suscripción' }).click();
    await expect(page.getByText(`¡Listo! Creaste «${name}»`)).toBeVisible();
    const code = (await page.getByTestId('invite-code').textContent())?.trim() ?? '';
    expect(code).toHaveLength(8);
    await page.getByRole('link', { name: 'Ver el grupo' }).click();
    await expect(page).toHaveURL(/\/grupos\/(?!nuevo$)[^/]+$/);
    const groupUrl = page.url();

    // 2. El miembro abre una solicitud con el código.
    const memberContext = await browser.newContext();
    const member = await memberContext.newPage();
    await login(member, 'miembro1@dev.vaquita');
    await member.goto('/unirse');
    await member.getByLabel('Código de invitación (8 caracteres)').fill(code);
    await member.getByRole('button', { name: 'Abrir solicitud' }).click();
    await member.getByRole('link', { name: 'Ir a la solicitud y al chat' }).click();
    await expect(member).toHaveURL(/\/solicitudes\/[^/]+$/);

    // 3. El titular envía datos de pago y registra el pago en efectivo (la solicitud pasa a miembro).
    await page.goto(groupUrl);
    await page.getByRole('tab', { name: 'Solicitudes' }).click();
    await page.locator('a[href*="/solicitudes/"]').first().click();
    await page.getByRole('button', { name: 'Enviar datos de pago' }).click();
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

    // 4. El tick de tareas genera el cobro del miembro (X-Jobs-Token, RF-000-14).
    const tick = await request.post(`${BACKEND_URL}/internal/jobs/tick`, {
      headers: { 'X-Jobs-Token': JOBS_TOKEN },
    });
    expect(tick.status()).toBe(200);

    // 5. El miembro sube el comprobante de su cobro.
    await member.goto('/panel');
    await member.getByRole('link', { name: 'Subir comprobante' }).first().click();
    await expect(member).toHaveURL(/\/cobros\/[^/]+$/);
    const chargeUrl = member.url();
    await member.locator('input[type="file"]').setInputFiles({
      name: 'comprobante.png',
      mimeType: 'image/png',
      buffer: RECEIPT_PNG,
    });
    await member.getByLabel('Referencia (obligatoria)').fill('REF-E2E-001');
    await member.getByRole('button', { name: 'Enviar' }).click();
    await expect(member.getByText(/comprobante/i).first()).toBeVisible();

    // 6. El titular confirma el pago del cobro.
    await page.goto(chargeUrl);
    await page.getByRole('button', { name: 'Confirmar pago' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Confirmar pago' }).click();
    await expect(page.getByText(/Pagado|pagado/).first()).toBeVisible();

    await memberContext.close();
  });
});
