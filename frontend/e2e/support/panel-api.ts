/**
 * Simulación de la API para las E2E del panel (spec 006 T018). Mientras el backend no tenga los
 * endpoints de reportes, el navegador responde con datos del contrato 006 interceptando `/api/*`
 * con `page.route` (no se llama al backend). Una cookie `vq_session` de prueba deja pasar a
 * `proxy.ts`, que solo comprueba que exista; ninguna llamada llega al proxy de Next.
 *
 * Cuando el backend esté listo (T013, T019), estas pruebas pueden correr también contra él con el
 * seed de la spec 006 quitando `mockPanelApi`.
 */
import type { BrowserContext, Page, Route } from '@playwright/test';

export interface PanelApiData {
  dashboard: unknown;
  charts: unknown;
  lists?: Partial<Record<'debts' | 'in_review' | 'owed', unknown[]>>;
  groups?: Array<{ id: string; name: string }>;
}

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

export async function addTestSession(context: BrowserContext, baseURL: string) {
  await context.addCookies([{ name: 'vq_session', value: 'e2e-panel', url: baseURL }]);
}

export async function mockPanelApi(page: Page, data: PanelApiData) {
  await page.route('**/api/**', (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path === '/api/me/dashboard') return json(route, data.dashboard);
    if (path === '/api/me/dashboard/charts') return json(route, data.charts);
    if (path === '/api/me/dashboard/lists') {
      const list = url.searchParams.get('list') as 'debts' | 'in_review' | 'owed';
      return json(route, { items: data.lists?.[list] ?? [], nextCursor: null });
    }
    if (path === '/api/groups') {
      return json(route, { items: data.groups ?? [], nextCursor: null });
    }
    if (path === '/api/notifications/unread-count') return json(route, { unreadCount: 0 });
    if (path === '/api/notifications') {
      return json(route, { items: [], nextCursor: null, unreadCount: 0 });
    }
    return json(route, { code: 'NOT_FOUND', message: 'Sin simulación en la E2E.' }, 404);
  });
}

/** Panel de un miembro de dos grupos en octubre de 2026 (contrato 006). */
export function dashboardFixture(overrides: Record<string, unknown> = {}) {
  return {
    month: '2026-10',
    groupId: null,
    availableMonths: ['2026-10', '2026-09'],
    isEmpty: false,
    hasGroups: true,
    spend: {
      totalCents: 5550,
      paidCents: 3000,
      lines: [
        {
          groupId: 'g2',
          groupName: 'Spotify depa',
          serviceName: 'Spotify',
          logoUrl: null,
          role: 'miembro',
          costCents: 3000,
          paidCents: 3000,
        },
        {
          groupId: 'g3',
          groupName: 'Disney+ primos',
          serviceName: 'Disney+',
          logoUrl: null,
          role: 'miembro',
          costCents: 2550,
          paidCents: 0,
        },
      ],
    },
    savings: {
      totalCents: 4960,
      estimated: true,
      lines: [
        {
          groupId: 'g2',
          serviceName: 'Spotify',
          role: 'miembro',
          individualPriceBsCents: 7960,
          shareCents: 3000,
          savingsCents: 4960,
        },
      ],
      withoutData: [{ groupId: 'g3', serviceName: 'Disney+' }],
      negativeNote: null,
    },
    debts: { totalCents: 2550, count: 1, inReviewCents: 0, inReviewCount: 0 },
    owed: null,
    collection: [],
    ...overrides,
  };
}

export const chartsFixture = {
  monthly: [
    { period: '2026-08', totalCents: 4190, paidCents: 4190 },
    { period: '2026-09', totalCents: 7250, paidCents: 7250 },
    { period: '2026-10', totalCents: 5550, paidCents: 3000 },
  ],
  byService: [
    { groupId: 'g2', serviceName: 'Spotify', costCents: 3000 },
    { groupId: 'g3', serviceName: 'Disney+', costCents: 2550 },
  ],
  savings: [
    { period: '2026-08', savingsCents: null, cumulativeCents: 0 },
    { period: '2026-09', savingsCents: 4960, cumulativeCents: 4960 },
    { period: '2026-10', savingsCents: 4960, cumulativeCents: 9920 },
  ],
};
