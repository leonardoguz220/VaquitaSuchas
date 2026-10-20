/**
 * E2E de solicitud desde la publicación y confirmación del titular (spec 008 T020; RN-008-03;
 * spec 010 RF-010-11, RF-010-13, RF-010-17). El miembro pide un cupo desde `/cupos/[id]`; el
 * titular envía los datos de pago; el miembro sube el comprobante; el titular confirma el ingreso.
 */
import { expect, test } from '@playwright/test';
import { closeGroup, createGroup, listingIdOf, login, publishListing } from './listings-helpers';

// PNG de 1×1 píxel: basta para que el comprobante pase la validación de tipo y tamaño.
const PROOF = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

test.describe('cupos libres: solicitar y confirmar', () => {
  test.skip(!process.env.SEED_DEV_PASSWORD, 'Falta SEED_DEV_PASSWORD en el entorno');
  test.setTimeout(120_000);

  test('miembro2 pide un cupo desde la publicación y el titular confirma el ingreso', async ({
    browser,
  }) => {
    const titularContext = await browser.newContext();
    const titular = await titularContext.newPage();
    await login(titular, 'titular@dev.vaquita');
    const groupId = await createGroup(titular);
    const reference = `E2E-${Date.now().toString().slice(-8)}`;

    try {
      await publishListing(titular, groupId, 'Cupo para probar la confirmación');
      const listingId = await listingIdOf(titular.request, groupId);

      const memberContext = await browser.newContext();
      const member = await memberContext.newPage();
      await login(member, 'miembro2@dev.vaquita');
      await member.goto(`/cupos/${listingId}`);
      await member.getByRole('button', { name: 'Solicitar', exact: true }).click();
      await member.getByLabel('Mensaje para el titular (opcional)').fill('Hola, quiero entrar');
      await member.getByRole('button', { name: 'Enviar solicitud' }).click();
      await expect(member.getByText('Solicitud enviada')).toBeVisible();

      // El titular abre la solicitud y envía los datos de pago.
      await titular.goto(`/grupos/${groupId}`);
      await titular.getByRole('tab', { name: 'Solicitudes' }).click();
      await titular
        .getByRole('link', { name: /Abierta/ })
        .first()
        .click();
      await titular.getByRole('button', { name: 'Enviar datos de pago' }).click();
      await titular.getByLabel('Otros datos solo para esta solicitud').check();
      await titular.getByLabel('Datos de pago (opcional si subes un QR)').fill('QR de prueba E2E');
      const requestUrl = titular.url();
      await titular
        .getByRole('dialog')
        .getByRole('button', { name: 'Enviar datos de pago' })
        .click();
      await expect(titular.getByRole('dialog')).toBeHidden();

      // El miembro sube el comprobante con método y referencia.
      await member.goto(requestUrl);
      await member.locator('input[type="file"][accept*="application/pdf"]').setInputFiles({
        name: 'comprobante.png',
        mimeType: 'image/png',
        buffer: PROOF,
      });
      await member.getByLabel('Transferencia').check();
      await member.getByLabel('Referencia (obligatoria)').fill(reference);
      await member.getByRole('button', { name: 'Enviar comprobante' }).click();
      await expect(member.getByText(reference)).toBeVisible();
      await memberContext.close();

      // El titular confirma el ingreso con la cuota nueva a la vista.
      await titular.reload();
      await titular.getByRole('button', { name: 'Confirmar ingreso' }).click();
      await titular.getByRole('dialog').getByRole('button', { name: 'Confirmar ingreso' }).click();
      await expect(titular.getByRole('dialog')).toBeHidden();
      await expect(titular.getByRole('button', { name: 'Confirmar ingreso' })).toHaveCount(0);
    } finally {
      await closeGroup(titular, groupId).catch((error: unknown) => {
        test.info().annotations.push({ type: 'cleanup', description: String(error) });
      });
      await titularContext.close();
    }
  });
});
