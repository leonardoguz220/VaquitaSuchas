/**
 * E2E del chat de la solicitud de ingreso (spec 010 T046; CA-010-19, CA-010-22). Titular y
 * solicitante intercambian un texto y una imagen y se ven en un máximo de 10 segundos; un mensaje
 * con `<script>` se muestra como texto plano. Usa los usuarios del seed de desarrollo y
 * `SEED_DEV_PASSWORD` del entorno.
 */
import { expect, test } from '@playwright/test';
import { closeGroup, login } from './listings-helpers';

// PNG de 1×1 píxel: basta para pasar la validación de tipo y tamaño de la imagen del chat.
const IMAGE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
const SCRIPT_TEXT = '<script>window.__xss = true</script> hola';
const MAX_WAIT_MS = 10_000;

test.describe('solicitud de ingreso: chat', () => {
  test.skip(!process.env.SEED_DEV_PASSWORD, 'Falta SEED_DEV_PASSWORD en el entorno');
  test.setTimeout(120_000);

  test('CA-010-19 y CA-010-22: texto e imagen llegan en 10 s y <script> se ve como texto', async ({
    browser,
  }) => {
    const titularContext = await browser.newContext();
    titularContext.setDefaultTimeout(20_000);
    const titular = await titularContext.newPage();
    await login(titular, 'titular@dev.vaquita');
    let groupId = '';

    try {
      await titular.goto('/grupos/nuevo');
      await titular
        .getByRole('button', { name: /Netflix/ })
        .first()
        .click();
      await titular.getByRole('radio', { name: /Estándar/ }).check();
      await titular.getByRole('button', { name: 'Siguiente: datos del grupo' }).click();
      await titular
        .getByLabel('Nombre del grupo')
        .fill(`Chat E2E ${Date.now().toString().slice(-6)}`);
      await titular.getByLabel('Tipo de cambio (Bs por USD)').fill('6.96');
      await titular.getByRole('button', { name: 'Crear suscripción' }).click();
      const code = (await titular.getByTestId('invite-code').textContent())?.trim() ?? '';
      expect(code).toHaveLength(8);
      await titular.getByRole('link', { name: 'Ver el grupo' }).click();
      await expect(titular).toHaveURL(/\/grupos\/(?!nuevo$)[^/]+$/);
      groupId = new URL(titular.url()).pathname.split('/').pop() ?? '';

      const memberContext = await browser.newContext();
      memberContext.setDefaultTimeout(20_000);
      const member = await memberContext.newPage();
      await login(member, 'miembro3@dev.vaquita');
      await member.goto('/unirse');
      await member.getByLabel('Código de invitación (8 caracteres)').fill(code);
      await member.getByRole('button', { name: 'Abrir solicitud' }).click();
      await member.getByRole('link', { name: 'Ir a la solicitud y al chat' }).click();
      await expect(member).toHaveURL(/\/solicitudes\/[^/]+$/);
      await titular.goto(member.url());

      // El solicitante escribe un texto con <script> y adjunta una imagen.
      await member.getByRole('textbox', { name: /^Mensaje para/ }).fill(SCRIPT_TEXT);
      await member.getByRole('button', { name: 'Enviar', exact: true }).click();
      await expect(
        member.getByRole('log', { name: /^Mensajes con/ }).getByText(SCRIPT_TEXT),
      ).toBeVisible();
      await member
        .getByRole('region', { name: /^Chat con/ })
        .locator('input[type="file"]')
        .setInputFiles({
          name: 'foto.png',
          mimeType: 'image/png',
          buffer: IMAGE,
        });
      await member.getByRole('button', { name: 'Enviar', exact: true }).click();

      // El titular los ve, en orden y dentro de 10 segundos, sin recargar.
      const log = titular.getByRole('log', { name: /^Mensajes con/ });
      await expect(log.getByText(SCRIPT_TEXT)).toBeVisible({ timeout: MAX_WAIT_MS });
      await expect(log.getByRole('button', { name: 'Ver imagen' })).toBeVisible({
        timeout: MAX_WAIT_MS,
      });
      const items = await log.getByRole('listitem').allTextContents();
      expect(items.findIndex((text) => text.includes('<script>'))).toBeLessThan(
        items.findIndex((text) => text.includes('Ver imagen')),
      );

      // CA-010-22: el <script> es texto, no un elemento, y no se ejecutó.
      await expect(log.locator('script')).toHaveCount(0);
      expect(await titular.evaluate(() => 'xss' in window || '__xss' in window)).toBe(false);

      // El titular responde y el solicitante lo ve en 10 segundos.
      await titular
        .getByRole('textbox', { name: /^Mensaje para/ })
        .fill('Te paso los datos de pago');
      await titular.getByRole('button', { name: 'Enviar', exact: true }).click();
      await expect(
        member.getByRole('log', { name: /^Mensajes con/ }).getByText('Te paso los datos de pago'),
      ).toBeVisible({ timeout: MAX_WAIT_MS });

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
