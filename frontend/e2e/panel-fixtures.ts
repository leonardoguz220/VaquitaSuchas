/**
 * Datos y simulación de la API para los E2E del panel (spec 006, T019). Las respuestas siguen el
 * contrato `GET /me/dashboard`, `/lists`, `/charts` y `/groups`. Los montos ya vienen en centavos,
 * como los entrega el backend: el E2E no calcula nada.
 *
 * La sesión es solo una cookie `vq_session` (el proxy de rutas solo mira que exista), así que no
 * hace falta el backend: cada llamada `/api/...` se responde con `page.route`.
 */
import type { BrowserContext, Page } from '@playwright/test';

export const SESSION_COOKIE_NAME = 'vq_session';

export const MONTH = '2026-10';

const GROUP_ID = '0c5e1f7a-0000-4000-8000-00000000a001';

/** Resumen con gasto, ahorro positivo, deudas y cobranza de un grupo. */
export const SUMMARY_WITH_DATA = {
  month: MONTH,
  groupId: null,
  availableMonths: [MONTH, '2026-09'],
  isEmpty: false,
  hasGroups: true,
  spend: {
    totalCents: 5550,
    paidCents: 3000,
    lines: [
      {
        groupId: GROUP_ID,
        groupName: 'Netflix familia',
        serviceName: 'Netflix',
        logoUrl: null,
        role: 'titular',
        costCents: 3000,
        paidCents: null,
      },
      {
        groupId: GROUP_ID,
        groupName: 'Spotify',
        serviceName: 'Spotify',
        logoUrl: null,
        role: 'miembro',
        costCents: 2550,
        paidCents: 3000,
      },
    ],
  },
  savings: {
    totalCents: 1000,
    estimated: true,
    lines: [],
    withoutData: [],
    negativeNote: null,
  },
  debts: { totalCents: 2500, count: 1, inReviewCents: 0, inReviewCount: 0 },
  owed: null,
  collection: [],
};

/** Ahorro negativo (RN-006-03): la API manda el total con signo y la nota explicativa. */
export const SUMMARY_NEGATIVE_SAVINGS = {
  ...SUMMARY_WITH_DATA,
  savings: {
    totalCents: -1200,
    estimated: true,
    lines: [
      {
        groupId: GROUP_ID,
        serviceName: 'Netflix',
        role: 'miembro',
        individualPriceBsCents: 4000,
        shareCents: 5200,
        savingsCents: -1200,
      },
    ],
    withoutData: [],
    negativeNote: 'Este mes pagas más que el precio individual del servicio.',
  },
};

/** Sin grupos y sin datos (CA-006-14). */
export const SUMMARY_EMPTY = {
  month: MONTH,
  groupId: null,
  availableMonths: [MONTH],
  isEmpty: true,
  hasGroups: false,
  spend: { totalCents: 0, paidCents: 0, lines: [] },
  savings: { totalCents: null, estimated: true, lines: [], withoutData: [], negativeNote: null },
  debts: { totalCents: 0, count: 0, inReviewCents: 0, inReviewCount: 0 },
  owed: null,
  collection: [],
};

/** Series de los gráficos: 3 meses con datos, gasto por servicio y ahorro acumulado. */
export const CHARTS = {
  monthly: [
    { period: '2026-08', totalCents: 5550, paidCents: 5550 },
    { period: '2026-09', totalCents: 5550, paidCents: 3000 },
    { period: MONTH, totalCents: 5550, paidCents: 3000 },
  ],
  byService: [
    { groupId: GROUP_ID, serviceName: 'Netflix', costCents: 3000 },
    { groupId: GROUP_ID, serviceName: 'Spotify', costCents: 2550 },
  ],
  savings: [
    { period: '2026-08', savingsCents: 800, cumulativeCents: 800 },
    { period: '2026-09', savingsCents: null, cumulativeCents: 800 },
    { period: MONTH, savingsCents: -1200, cumulativeCents: -400 },
  ],
};

/** Responde el panel con `summary` y los gráficos de `CHARTS`; las listas y grupos van vacíos. */
export async function mockPanelApi(page: Page, summary: object, charts: object = CHARTS) {
  // Se registra primero la respuesta genérica: Playwright prueba las últimas primero.
  await page.route(/\/api\//, (route) =>
    route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ statusCode: 404, code: 'NOT_FOUND', message: 'No encontrado' }),
    }),
  );
  await page.route(/\/api\/me\/dashboard(\?.*)?$/, (route) => route.fulfill({ json: summary }));
  await page.route(/\/api\/me\/dashboard\/charts/, (route) => route.fulfill({ json: charts }));
  await page.route(/\/api\/me\/dashboard\/lists/, (route) =>
    route.fulfill({ json: { items: [], nextCursor: null } }),
  );
  await page.route(/\/api\/groups(\?.*)?$/, (route) =>
    route.fulfill({ json: { items: [], nextCursor: null } }),
  );
}

/** Deja una sesión de prueba: el proxy solo comprueba que la cookie exista. */
export async function signInForPanel(context: BrowserContext, baseURL: string) {
  await context.addCookies([
    { name: SESSION_COOKIE_NAME, value: 'e2e-panel', url: baseURL, httpOnly: true },
  ]);
}
