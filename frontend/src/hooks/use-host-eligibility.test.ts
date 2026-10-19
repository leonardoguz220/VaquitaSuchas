import { act, renderHook, waitFor } from '@testing-library/react';
import { eligibleHost } from '@/components/features/groups/__fixtures__/groups';
import { getHostEligibility } from '@/services/groups';
import { ApiError } from '@/services/http';
import { useHostEligibility } from './use-host-eligibility';

jest.mock('@/services/groups', () => ({ getHostEligibility: jest.fn() }));

const replace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/grupos/nuevo',
}));

const mocked = jest.mocked(getHostEligibility);

beforeEach(() => {
  mocked.mockReset();
  replace.mockReset();
  window.history.replaceState(null, '', '/grupos/nuevo');
});

describe('useHostEligibility (RF-001-21)', () => {
  it('CA-001-25: pasa de cargando a los datos de la API', async () => {
    mocked.mockResolvedValue(eligibleHost);
    const { result } = renderHook(() => useHostEligibility());
    expect(result.current.state.status).toBe('loading');
    await waitFor(() =>
      expect(result.current.state).toEqual({ status: 'success', eligibility: eligibleHost }),
    );
  });

  it('CA-001-24: un error se puede reintentar', async () => {
    mocked.mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'x'));
    mocked.mockResolvedValue(eligibleHost);
    const { result } = renderHook(() => useHostEligibility());
    await waitFor(() => expect(result.current.state.status).toBe('error'));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.state.status).toBe('success'));
  });

  it('CA-001-24: un 401 redirige a /ingresar', async () => {
    mocked.mockRejectedValue(new ApiError(401, 'UNAUTHENTICATED', 'x'));
    const { result } = renderHook(() => useHostEligibility());
    await waitFor(() => expect(result.current.state.status).toBe('redirecting'));
    expect(replace).toHaveBeenCalledWith('/ingresar?next=%2Fgrupos%2Fnuevo');
  });
});
