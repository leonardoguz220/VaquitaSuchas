/**
 * Accesibilidad de cupos libres (spec 008 T028; RNF-008-05): `/cupos`, `/cupos/[id]` y la pestaña
 * «Publicar cupos». Comprueba etiquetas accesibles, un solo `h1`, referencias `aria-*` válidas y
 * controles de 44 px. El contraste es una aproximación (texto frente al primer fondo opaco): no hay motor de
 * accesibilidad instalado.
 */
import { expect, test, type Page } from '@playwright/test';
import { closeGroup, createGroup, listingIdOf, login, publishListing } from './listings-helpers';

/** Problemas de accesibilidad visibles en la página, como texto legible. */
async function audit(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const issues: string[] = [];
    const label = (el: Element) => {
      const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
      return text.slice(0, 40) || el.tagName.toLowerCase();
    };
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width >= 2 && r.height >= 2 && s.visibility !== 'hidden' && s.display !== 'none';
    };
    const named = (el: Element) => {
      if ((el.getAttribute('aria-label') ?? '').trim()) return true;
      const ids = (el.getAttribute('aria-labelledby') ?? '').split(/\s+/).filter(Boolean);
      if (ids.some((id) => (document.getElementById(id)?.textContent ?? '').trim())) return true;
      const labels = (el as HTMLInputElement).labels;
      if (labels && Array.from(labels).some((l) => l.textContent?.trim())) return true;
      if ((el.getAttribute('title') ?? '').trim()) return true;
      if ((el.textContent ?? '').trim()) return true;
      const img = el.querySelector('img[alt]');
      return Boolean(img && (img.getAttribute('alt') ?? '').trim());
    };

    const controls = Array.from(
      document.querySelectorAll(
        'button, a[href], input:not([type=hidden]), select, textarea, [role=tab]',
      ),
    ).filter(visible);
    for (const el of controls) {
      if (!named(el)) issues.push(`sin nombre accesible: ${el.tagName.toLowerCase()} ${label(el)}`);
    }

    const sized = controls.filter((el) => !el.matches('a[href]'));
    for (const el of sized) {
      const { height } = el.getBoundingClientRect();
      if (height < 44) issues.push(`menos de 44 px (${Math.round(height)}): ${label(el)}`);
    }

    // Contraste aproximado: color del texto frente al primer fondo opaco de sus ancestros.
    const channels = (color: string) => {
      const m = color.match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const [r, g, b, a = 1] = m[1]
        .split(/[\s,/]+/)
        .filter(Boolean)
        .map(Number);
      return { r, g, b, a };
    };
    const luminance = ({ r, g, b }: { r: number; g: number; b: number }) => {
      const lin = (v: number) => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    };
    const backgroundOf = (el: Element) => {
      for (let node: Element | null = el; node; node = node.parentElement) {
        const bg = channels(getComputedStyle(node).backgroundColor);
        if (bg && bg.a > 0) return bg;
      }
      return { r: 255, g: 255, b: 255, a: 1 };
    };
    for (const el of Array.from(document.querySelectorAll('body *')).filter(visible)) {
      const hasText = Array.from(el.childNodes).some(
        (node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim(),
      );
      const fg = channels(getComputedStyle(el).color);
      if (!hasText || !fg || fg.a < 1) continue;
      const bg = backgroundOf(el);
      const [hi, lo] = [luminance(fg), luminance(bg)].sort((x, y) => y - x);
      const ratio = (hi + 0.05) / (lo + 0.05);
      const style = getComputedStyle(el);
      const large =
        parseFloat(style.fontSize) >= 24 ||
        (parseFloat(style.fontSize) >= 18.66 && Number(style.fontWeight) >= 700);
      const minimum = large ? 3 : 4.5;
      if (ratio < minimum) {
        issues.push(`contraste ${ratio.toFixed(2)}:1 (mínimo ${minimum}): ${label(el)}`);
      }
    }

    const h1Count = Array.from(document.querySelectorAll('h1')).filter(visible).length;
    if (h1Count !== 1) issues.push(`se esperaba un solo h1 visible y hay ${h1Count}`);

    for (const attr of ['aria-labelledby', 'aria-describedby', 'aria-controls']) {
      for (const el of Array.from(document.querySelectorAll(`[${attr}]`))) {
        for (const id of (el.getAttribute(attr) ?? '').split(/\s+/).filter(Boolean)) {
          if (!document.getElementById(id))
            issues.push(`${attr} apunta a un id inexistente: ${id}`);
        }
      }
    }
    return issues;
  });
}

/** Tab lleva el foco a un control con contorno o sombra visibles. */
async function focusIsVisible(page: Page): Promise<boolean> {
  await page.keyboard.press('Tab');
  return page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return false;
    const style = getComputedStyle(el);
    return style.outlineStyle !== 'none' || style.boxShadow !== 'none';
  });
}

test.describe('cupos libres: accesibilidad', () => {
  test.skip(!process.env.SEED_DEV_PASSWORD, 'Falta SEED_DEV_PASSWORD en el entorno');
  test.setTimeout(120_000);

  test('RNF-008-05: /cupos, /cupos/[id] y Publicar cupos cumplen etiquetas, aria y 44 px', async ({
    browser,
  }) => {
    const titularContext = await browser.newContext();
    const titular = await titularContext.newPage();
    await login(titular, 'titular@dev.vaquita');
    const groupId = await createGroup(titular);

    try {
      await publishListing(titular, groupId, 'Descripción para revisar accesibilidad');
      const listingId = await listingIdOf(titular.request, groupId);
      await titular.goto(`/grupos/${groupId}`);
      await titular.getByRole('tab', { name: 'Publicar cupos' }).click();
      await expect(titular.getByRole('tabpanel', { name: 'Publicar cupos' })).toBeVisible();
      expect(await audit(titular), 'Publicar cupos').toEqual([]);
      expect(await focusIsVisible(titular), 'foco en Publicar cupos').toBe(true);

      const visitorContext = await browser.newContext();
      const visitor = await visitorContext.newPage();
      await login(visitor, 'miembro2@dev.vaquita');

      await visitor.goto('/cupos');
      await expect(visitor.getByRole('heading', { name: 'Cupos libres', level: 1 })).toBeVisible();
      expect(await audit(visitor), '/cupos').toEqual([]);
      expect(await focusIsVisible(visitor), 'foco en /cupos').toBe(true);

      await visitor.goto(`/cupos/${listingId}`);
      await expect(visitor.getByText('Descripción para revisar accesibilidad')).toBeVisible();
      expect(await audit(visitor), '/cupos/[id]').toEqual([]);
      expect(await focusIsVisible(visitor), 'foco en /cupos/[id]').toBe(true);
      await visitorContext.close();
    } finally {
      await closeGroup(titular, groupId).catch((error: unknown) => {
        test.info().annotations.push({ type: 'cleanup', description: String(error) });
      });
      await titularContext.close();
    }
  });
});
