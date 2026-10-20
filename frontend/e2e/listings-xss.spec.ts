/**
 * E2E de seguridad de cupos libres (spec 008 T016; CA-008-19). La descripción de la publicación
 * se muestra como texto: `<script>` no se ejecuta ni se convierte en HTML.
 */
import { expect, test } from '@playwright/test';
import { closeGroup, createGroup, listingIdOf, login, publishListing } from './listings-helpers';

const PAYLOAD = '<script>alert(1)</script>';

test.describe('cupos libres: texto sin HTML', () => {
  test.skip(!process.env.SEED_DEV_PASSWORD, 'Falta SEED_DEV_PASSWORD en el entorno');
  test.setTimeout(120_000);

  test('CA-008-19: la descripción con <script> se ve como texto y no se ejecuta', async ({
    browser,
  }) => {
    const titularContext = await browser.newContext();
    const titular = await titularContext.newPage();
    await login(titular, 'titular@dev.vaquita');
    const groupId = await createGroup(titular);

    try {
      await publishListing(titular, groupId, PAYLOAD);
      const listingId = await listingIdOf(titular.request, groupId);

      // Visitante distinto del titular, con su propia sesión.
      const visitorContext = await browser.newContext();
      const visitor = await visitorContext.newPage();
      const dialogs: string[] = [];
      visitor.on('dialog', (dialog) => {
        dialogs.push(dialog.message());
        void dialog.dismiss();
      });
      await login(visitor, 'miembro2@dev.vaquita');

      await visitor.goto(`/cupos/${listingId}`);
      await expect(visitor.getByText(PAYLOAD, { exact: true })).toBeVisible();
      await expect(visitor.locator('script', { hasText: 'alert(1)' })).toHaveCount(0);

      await visitor.goto('/cupos');
      await expect(visitor.getByRole('heading', { name: 'Cupos libres' })).toBeVisible();

      await visitor.waitForTimeout(500);
      expect(dialogs, 'no debe abrirse ningún diálogo de JavaScript').toEqual([]);
      await visitorContext.close();
    } finally {
      await closeGroup(titular, groupId).catch((error: unknown) => {
        test.info().annotations.push({ type: 'cleanup', description: String(error) });
      });
      await titularContext.close();
    }
  });
});
