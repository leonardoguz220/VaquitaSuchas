import { renderHook, waitFor } from '@testing-library/react';
import { myPending } from '@/components/features/charges/__fixtures__/charges';
import { listMyCharges } from '@/services/charges';
import { ApiError } from '@/services/http';
import { useMyCharges } from './use-my-charges';

jest.mock('@/services/charges', () => ({ listMyCharges: jest.fn() }));

const replace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/cobros',
}));

const mocked = jest.mocked(listMyCharges);

beforeEach(() => {
  mocked.mockReset();
  replace.mockReset();
  window.history.replaceState(null, '', '/cobros');
});

describe('useMyCharges (GET /me/charges)', () => {
  it('RF-002-15: pasa estado y período como query y entrega los ítems', async () => {
    mocked.mockResolvedValue({ items: [myPending], nextCursor: null });
    const { result } = renderHook(() => useMyCharges({ status: 'pendiente', period: '2026-10' }));
    await waitFor(() =>
      expect(result.current.state).toEqual({ status: 'success', items: [myPending] }),
    );
    expect(mocked).toHaveBeenCalledWith(
      { status: ['pendiente'], period: '2026-10' },
      { signal: expect.any(AbortSignal) },
    );
  });

  it('sin filtros no manda query', async () => {
    mocked.mockResolvedValue({ items: [], nextCursor: null });
    renderHook(() => useMyCharges({ status: null, period: null }));
    await waitFor(() => expect(mocked).toHaveBeenCalledWith({}, expect.anything()));
  });

  it('un 401 redirige a /ingresar', async () => {
    mocked.mockRejectedValue(new ApiError(401, 'UNAUTHENTICATED', 'x'));
    const { result } = renderHook(() => useMyCharges({ status: null, period: null }));
    await waitFor(() => expect(result.current.state.status).toBe('redirecting'));
    expect(replace).toHaveBeenCalledWith('/ingresar?next=%2Fcobros');
  });
});
