import { act, renderHook, waitFor } from '@testing-library/react';
import { getBillingSummary } from '@/services/charges';
import { billingSummary, MOCK_BILLING_GROUP_IDS } from '@/services/group-billing.mock';
import { ApiError } from '@/services/http';
import { useBillingSummary } from './use-billing-summary';

jest.mock('@/services/charges', () => ({ getBillingSummary: jest.fn() }));

const replace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/grupos/abc',
}));

const mocked = jest.mocked(getBillingSummary);
const OWNER = MOCK_BILLING_GROUP_IDS.owner;

beforeEach(() => {
  mocked.mockReset();
  replace.mockReset();
  window.history.replaceState(null, '', '/grupos/abc');
});

describe('useBillingSummary (GET /groups/:id/billing/summary)', () => {
  it('RF-002-16: sin período pide el último ciclo y entrega el resumen tal cual', async () => {
    const summary = billingSummary(OWNER, undefined);
    mocked.mockResolvedValue(summary);
    const { result } = renderHook(() => useBillingSummary(OWNER, null));
    await waitFor(() => expect(result.current.state).toEqual({ status: 'success', summary }));
    expect(mocked).toHaveBeenCalledWith(OWNER, undefined, { signal: expect.any(AbortSignal) });
  });

  it('al cambiar de período conserva el resumen anterior mientras carga', async () => {
    const october = billingSummary(OWNER, '2026-10');
    mocked.mockResolvedValueOnce(october).mockReturnValueOnce(new Promise(() => {}));
    const { result, rerender } = renderHook(({ period }) => useBillingSummary(OWNER, period), {
      initialProps: { period: null as string | null },
    });
    await waitFor(() => expect(result.current.state.status).toBe('success'));
    rerender({ period: '2026-09' });
    expect(result.current.state).toEqual({ status: 'loading', previous: october });
  });

  it('un 404 (sin ciclo) es el estado vacío', async () => {
    mocked.mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'x'));
    const { result } = renderHook(() => useBillingSummary('sin-ciclo', null));
    await waitFor(() => expect(result.current.state).toEqual({ status: 'empty' }));
  });

  it('un error se puede reintentar', async () => {
    const summary = billingSummary(OWNER, undefined);
    mocked.mockRejectedValueOnce(new ApiError(500, 'INTERNAL', 'x')).mockResolvedValue(summary);
    const { result } = renderHook(() => useBillingSummary(OWNER, null));
    await waitFor(() => expect(result.current.state.status).toBe('error'));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.state.status).toBe('success'));
  });

  it('un 401 redirige a /ingresar', async () => {
    mocked.mockRejectedValue(new ApiError(401, 'UNAUTHENTICATED', 'x'));
    const { result } = renderHook(() => useBillingSummary(OWNER, null));
    await waitFor(() => expect(result.current.state.status).toBe('redirecting'));
    expect(replace).toHaveBeenCalledWith('/ingresar?next=%2Fgrupos%2Fabc');
  });
});
