import {
  exportGroupHistoryCsv,
  exportHistoryCsv,
  getCalendar,
  getDashboard,
  getDashboardCharts,
  getGroupCollection,
  getUpcomingEvents,
  listDashboard,
  listHistory,
} from './reports';
import { MOCK_REPORT_IDS } from './reports.mock';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

async function settle<T>(promise: Promise<T>): Promise<T> {
  await jest.runAllTimersAsync();
  return promise;
}

async function expectRejection(promise: Promise<unknown>, shape: object) {
  const assertion = expect(promise).rejects.toMatchObject(shape);
  await jest.runAllTimersAsync();
  await assertion;
}

describe('services/reports con datos simulados (contrato 006): panel', () => {
  it('RF-006-01: getDashboard trae el mes con gasto, ahorro estimado, deudas y lo que me deben', async () => {
    const summary = await settle(getDashboard());
    expect(summary.month).toBe('2026-10');
    expect(summary.savings.estimated).toBe(true);
    expect(summary.spend.lines.length).toBeGreaterThan(0);
    expect(summary.owed).not.toBeNull();
  });

  it('RF-006-01: el filtro por suscripción deja solo sus líneas; un mes fuera de rango da 400', async () => {
    const summary = await settle(getDashboard({ groupId: MOCK_REPORT_IDS.ownerGroup }));
    expect(summary.groupId).toBe(MOCK_REPORT_IDS.ownerGroup);
    expect(summary.spend.lines.every((item) => item.groupId === MOCK_REPORT_IDS.ownerGroup)).toBe(
      true,
    );
    await expectRejection(getDashboard({ month: '2020-01' }), { statusCode: 400 });
  });

  it('RF-006-04: listDashboard trae cada lista con enlace a /cobros y pagina con cursor', async () => {
    const debts = await settle(listDashboard({ list: 'debts' }));
    expect(debts.items.every((item) => item.link.startsWith('/cobros/'))).toBe(true);
    const first = await settle(listDashboard({ list: 'owed', limit: 1 }));
    expect(first.items).toHaveLength(1);
    expect(first.nextCursor).not.toBeNull();
    const inReview = await settle(listDashboard({ list: 'in_review' }));
    expect(inReview.items.every((item) => item.status === 'en_revision')).toBe(true);
  });
});

describe('services/reports con datos simulados (contrato 006): cobranza del grupo', () => {
  it('RF-006-06: getGroupCollection da el resumen y los miembros al titular; 403 a otro', async () => {
    const collection = await settle(getGroupCollection(MOCK_REPORT_IDS.ownerGroup, '2026-09'));
    expect(collection.period).toBe('2026-09');
    expect(collection.members.length).toBeGreaterThan(0);
    await expectRejection(getGroupCollection(MOCK_REPORT_IDS.notOwnerGroup), { statusCode: 403 });
  });
});

describe('services/reports con datos simulados (contrato 006): gráficos', () => {
  it('RF-006-07: getDashboardCharts trae meses, servicios y ahorro acumulado', async () => {
    const charts = await settle(getDashboardCharts());
    expect(charts.monthly.length).toBeGreaterThan(0);
    expect(charts.byService.length).toBeGreaterThan(0);
    expect(charts.savings.some((item) => item.savingsCents === null)).toBe(true);
  });
});

describe('services/reports con datos simulados (contrato 006): calendario', () => {
  it('RF-006-11: getCalendar trae los eventos del mes pedido', async () => {
    const calendar = await settle(getCalendar('2026-11'));
    expect(calendar.events.every((item) => item.date.startsWith('2026-11'))).toBe(true);
    await expectRejection(getCalendar('2026-13'), { statusCode: 400 });
  });

  it('RF-006-12: getUpcomingEvents marca los montos estimados', async () => {
    const upcoming = await settle(getUpcomingEvents());
    expect(upcoming.events.some((item) => item.estimated)).toBe(true);
  });
});

describe('services/reports con datos simulados (contrato 006): historial y exportación', () => {
  it('RF-006-13: listHistory filtra por mes, suscripción y estado', async () => {
    const all = await settle(listHistory());
    const october = await settle(listHistory({ period: '2026-10', status: 'atrasado' }));
    expect(october.items.length).toBeLessThan(all.items.length);
    expect(october.items.every((item) => item.period === '2026-10')).toBe(true);
  });

  it('RF-006-14: exportHistoryCsv devuelve un CSV con el nombre que propone el servidor', async () => {
    const file = await settle(exportHistoryCsv({ period: '2026-10' }));
    expect(file.filename).toMatch(/\.csv$/);
    expect(file.blob.type).toContain('text/csv');
  });

  it('CA-006-17: exportGroupHistoryCsv solo para el titular del grupo', async () => {
    const file = await settle(exportGroupHistoryCsv(MOCK_REPORT_IDS.ownerGroup, {}));
    expect(file.filename).toContain('2026-10');
    await expectRejection(exportGroupHistoryCsv(MOCK_REPORT_IDS.notOwnerGroup, {}), {
      statusCode: 403,
    });
  });
});
