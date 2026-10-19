import { act, renderHook, waitFor } from '@testing-library/react';
import { paidCharge, pendingCharge } from '@/components/features/charges/__fixtures__/charges';
import { getCharge } from '@/services/charges';
import { ApiError } from '@/services/http';
import { useCharge } from './use-charge';

jest.mock('@/services/charges', () => ({ getCharge: jest.fn() }));

const replace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/cobros/abc',
}));

const mocked = jest.mocked(getCharge);

beforeEach(() => {
  mocked.mockReset();
  replace.mockReset();
  window.history.replaceState(null, '', '/cobros/abc');
});

describe('useCharge (GET /charges/:chargeId)', () => {
  it('entrega el cobro de la API y permite reemplazarlo tras una acción', async () => {
    mocked.mockResolvedValue(pendingCharge);
    const { result } = renderHook(() => useCharge(pendingCharge.id));
    expect(result.current.state.status).toBe('loading');
    await waitFor(() =>
      expect(result.current.state).toEqual({ status: 'success', charge: pendingCharge }),
    );
    act(() => result.current.update(paidCharge));
    expect(result.current.state).toEqual({ status: 'success', charge: paidCharge });
  });

  it('CA-002-12: un 403 queda como forbidden', async () => {
    mocked.mockRejectedValue(new ApiError(403, 'FORBIDDEN', 'x'));
    const { result } = renderHook(() => useCharge('otro'));
    await waitFor(() => expect(result.current.state).toEqual({ status: 'forbidden' }));
  });

  it('CA-002-23: un 404 queda como not_found', async () => {
    mocked.mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'x'));
    const { result } = renderHook(() => useCharge('ajeno'));
    await waitFor(() => expect(result.current.state).toEqual({ status: 'not_found' }));
  });

  it('un 401 redirige a /ingresar', async () => {
    mocked.mockRejectedValue(new ApiError(401, 'UNAUTHENTICATED', 'x'));
    const { result } = renderHook(() => useCharge('abc'));
    await waitFor(() => expect(result.current.state.status).toBe('redirecting'));
    expect(replace).toHaveBeenCalledWith('/ingresar?next=%2Fcobros%2Fabc');
  });
});
