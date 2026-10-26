/**
 * E2E del flujo feliz del MVP (spec 002 T043, spec 010 T046; CA-002-04, CA-002-06, CA-010-36).
 *
 * Crear grupo → invitar (solicitud por código) → ingreso confirmado → cobrar → pagar → confirmar.
 * Usa los usuarios del seed de desarrollo (`npm run seed:dev-users -w backend`). La contraseña sale
 * de `SEED_DEV_PASSWORD` del entorno y nunca se escribe aquí.
 */
import { expect, test, type APIRequestContext } from '@playwright/test';
import { closeGroup, login } from './listings-helpers';

// PNG de 1×1 píxel: basta para que el comprobante pase la validación de tipo y tamaño.
const PROOF = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:3001';

/**
 * Corre `billing.generate` con una fecha simulada (el día 2 del mes siguiente) para que el grupo
 * tenga su siguiente cobro. `now` solo se acepta fuera de producción. Reintenta si el disparador
 * responde 429. El cobro nace con esa fecha de emisión, posterior a la hora real; fuera de
 * producción el servidor confirma con `max(hora real, issued_at)`, sin parámetros extra.
 */
async function generateNextCycle(request: APIRequestContext) {
  const today = new Date();
  const next = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 2, 12));
  const now = next.toISOString().slice(0, 10);
  const url = `${BACKEND_URL}/internal/jobs/tick?job=billing.generate&now=${now}`;
  const headers = { 'X-Jobs-Token': process.env.JOBS_TOKEN ?? '' };
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await request.post(url, { headers });
    if (response.status() !== 429) {
      expect(response.ok(), 'POST /internal/jobs/tick debe responder 2xx').toBeTruthy();
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error('El disparador de tareas siguió respondiendo 429.');
}

test.describe('flujo feliz del MVP', () => {
  test.skip(!process.env.SEED_DEV_PASSWORD, 'Falta SEED_DEV_PASSWORD en el entorno');
  test.skip(!process.env.JOBS_TOKEN, 'Falta JOBS_TOKEN en el entorno');
  test.setTimeout(180_000);

  test('CA-002-04, CA-002-06 y CA-010-36: crear → invitar → cobrar → pagar → confirmar', async ({
    browser,
  }) => {
    const titularContext = await browser.newContext();
    titularContext.setDefaultTimeout(20_000);
    const titular = await titularContext.newPage();
    await login(titular, 'titular@dev.vaquita');
    const reference = `MVP-${Date.now().toString().slice(-8)}`;
    let groupId = '';

    try {
      // 1. Crear: el titular crea el grupo y obtiene el código de invitación.
      await titular.goto('/grupos/nuevo');
      await titular
        .getByRole('button', { name: /Netflix/ })
        .first()
        .click();
      await titular.getByRole('radio', { name: /Estándar/ }).check();
      await titular.getByRole('button', { name: 'Siguiente: datos del grupo' }).click();
      const name = `MVP E2E ${Date.now().toString().slice(-6)}`;
      await titular.getByLabel('Nombre del grupo').fill(name);
      await titular.getByLabel('Tipo de cambio (Bs por USD)').fill('6.96');
      await titular.getByRole('button', { name: 'Crear suscripción' }).click();
      await expect(titular.getByText(`¡Listo! Creaste «${name}»`)).toBeVisible();
      const code = (await titular.getByTestId('invite-code').textContent())?.trim() ?? '';
      expect(code).toHaveLength(8);
      await titular.getByRole('link', { name: 'Ver el grupo' }).click();
      await expect(titular).toHaveURL(/\/grupos\/(?!nuevo$)[^/]+$/);
      groupId = new URL(titular.url()).pathname.split('/').pop() ?? '';

      // 2. Invitar: el miembro abre la solicitud con el código.
      const memberContext = await browser.newContext();
      memberContext.setDefaultTimeout(20_000);
      const member = await memberContext.newPage();
      await login(member, 'miembro2@dev.vaquita');
      await member.goto('/unirse');
      await member.getByLabel('Código de invitación (8 caracteres)').fill(code);
      await member.getByRole('button', { name: 'Abrir solicitud' }).click();
      await member.getByRole('link', { name: 'Ir a la solicitud y al chat' }).click();
      await expect(member).toHaveURL(/\/solicitudes\/[^/]+$/);
      const requestUrl = member.url();

      // 3. El titular envía los datos de pago y el miembro sube el comprobante.
      await titular.goto(requestUrl);
      await titular.getByRole('button', { name: 'Enviar datos de pago' }).click();
      const dialog = titular.getByRole('dialog');
      await dialog.getByLabel('Otros datos solo para esta solicitud').check();
      await dialog.getByLabel('Datos de pago (opcional si subes un QR)').fill('Cuenta E2E');
      await dialog.getByRole('button', { name: 'Enviar datos de pago' }).click();
      await expect(titular.getByRole('dialog')).toBeHidden();

      await member.reload();
      await member.locator('input[type="file"][accept*="application/pdf"]').setInputFiles({
        name: 'comprobante.png',
        mimeType: 'image/png',
        buffer: PROOF,
      });
      await member.getByLabel('Transferencia').check();
      await member.getByLabel('Referencia (obligatoria)').fill(reference);
      await member.getByRole('button', { name: 'Enviar comprobante' }).click();
      await expect(member.getByText(reference)).toBeVisible();

      // 4. El titular confirma el ingreso: el miembro queda activo y su cobro de ingreso queda
      // pagado (CA-010-36).
      await titular.reload();
      await titular.getByRole('button', { name: 'Confirmar ingreso' }).click();
      await expect(titular.getByRole('button', { name: 'Confirmar ingreso' })).toHaveCount(0);
      await member.goto('/cobros');
      await expect(
        member
          .getByRole('list', { name: 'Tus cobros' })
          .getByRole('link', { name: new RegExp(`${name}.*Pagado`, 's') }),
      ).toBeVisible();

      // 5. Cobrar y pagar: llega el siguiente ciclo; el miembro abre su cobro pendiente y sube el
      // comprobante (CA-002-04).
      await generateNextCycle(member.request);
      await member.goto('/cobros');
      await member
        .getByRole('list', { name: 'Tus cobros' })
        .getByRole('link', { name: new RegExp(`${name}.*Pendiente`, 's') })
        .first()
        .click();
      await member.locator('input[type="file"][accept*="application/pdf"]').setInputFiles({
        name: 'pago.png',
        mimeType: 'image/png',
        buffer: PROOF,
      });
      await member.getByLabel('Referencia (obligatoria)').fill(`${reference}-C`);
      await member.getByRole('button', { name: 'Enviar', exact: true }).click();
      await expect(member.getByText('En revisión').first()).toBeVisible();

      // 6. El titular recibe el cobro en revisión y lo confirma: queda pagado (CA-002-06).
      await titular.goto(member.url());
      await titular.getByRole('button', { name: 'Confirmar pago' }).click();
      await titular.getByRole('dialog').getByRole('button', { name: 'Confirmar pago' }).click();
      await expect(titular.getByRole('button', { name: 'Confirmar pago' })).toHaveCount(0);
      await expect(titular.getByText('Pagado').first()).toBeVisible();
      await memberContext.close();
    } finally {
      if (groupId) {
        await closeGroup(titular, groupId).catch((error: unknown) => {
          test.info().annotations.push({ type: 'cleanup', description: String(error) });
        });
      }
      await titularContext.close();
    }
  });
});
