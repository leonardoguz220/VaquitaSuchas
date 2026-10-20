import {
  exportGroupHistoryCsv,
  exportHistoryCsv,
  getCalendar,
  getUpcomingEvents,
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
