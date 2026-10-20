import { act, renderHook } from '@testing-library/react';
import { getDashboard, listDashboard } from '@/services/reports';
import { useDashboard, useDashboardList } from './use-dashboard';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  usePathname: () => '/panel',
}));

jest.mock('@/services/reports', () => ({
  ...jest.requireActual('@/services/reports'),
  getDashboard: jest.fn(),
  listDashboard: jest.fn(),
}));

const mockedDashboard = jest.mocked(getDashboard);
const mockedList = jest.mocked(listDashboard);

let visibility: DocumentVisibilityState = 'visible';

function setVisibility(value: DocumentVisibilityState) {
  visibility = value;
  document.dispatchEvent(new Event('visibilitychange'));
}

/** Deja correr las promesas pendientes. */
async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeAll(() => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
});

beforeEach(() => {
  visibility = 'visible';
  mockedDashboard.mockReset();
  mockedList.mockReset();
  mockedDashboard.mockResolvedValue({ month: '2026-10' } as never);
  mockedList.mockResolvedValue({ items: [], nextCursor: null });
});

describe('useDashboard (spec 006 T013, RNF-006-02): recarga sin sondeo', () => {
  it('RNF-006-02: vuelve a pedir el resumen al volver a la pestaña', async () => {
    renderHook(() => useDashboard({ month: null, groupId: null }));
    await flush();
    expect(mockedDashboard).toHaveBeenCalledTimes(1);

    setVisibility('hidden');
    setVisibility('visible');
    await flush();
    expect(mockedDashboard).toHaveBeenCalledTimes(2);
  });

  it('RNF-006-02: con la pestaña oculta no pide nada', async () => {
    renderHook(() => useDashboard({ month: null, groupId: null }));
    await flush();

    setVisibility('hidden');
    await flush();
    expect(mockedDashboard).toHaveBeenCalledTimes(1);
  });
});

describe('useDashboardList (spec 006 T013, RF-006-04): recarga al volver', () => {
  it('RF-006-04: vuelve a pedir la primera página de la lista al volver a la pestaña', async () => {
    renderHook(() => useDashboardList('debts'));
    await flush();
    expect(mockedList).toHaveBeenCalledTimes(1);

    setVisibility('hidden');
    setVisibility('visible');
    await flush();
    expect(mockedList).toHaveBeenCalledTimes(2);
  });
});
