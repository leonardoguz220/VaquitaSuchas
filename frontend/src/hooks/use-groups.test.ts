import { act, renderHook, waitFor } from '@testing-library/react';
import { memberSummary, ownerSummary } from '@/components/features/groups/__fixtures__/groups';
import { listGroups } from '@/services/groups';
import { ApiError } from '@/services/http';
import { useGroups } from './use-groups';

jest.mock('@/services/groups', () => ({ listGroups: jest.fn() }));

const replace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/grupos',
}));

const mocked = jest.mocked(listGroups);

beforeEach(() => {
  mocked.mockReset();
  replace.mockReset();
  window.history.replaceState(null, '', '/grupos');
});

describe('useGroups (RF-001-19)', () => {
  it('CA-001-20: entrega los grupos tal como los lista la API', async () => {
    mocked.mockResolvedValue({ items: [ownerSummary, memberSummary], nextCursor: null });
    const { result } = renderHook(() => useGroups());
    expect(result.current.state.status).toBe('loading');
    await waitFor(() =>
      expect(result.current.state).toEqual({
        status: 'success',
        items: [ownerSummary, memberSummary],
      }),
    );
    expect(mocked).toHaveBeenCalledWith({}, { signal: expect.any(AbortSignal) });
  });

  it('CA-001-20: el filtro por rol se envía como query role y vuelve a cargar', async () => {
    mocked.mockResolvedValue({ items: [memberSummary], nextCursor: null });
    const { result, rerender } = renderHook(({ role }) => useGroups(role), {
      initialProps: { role: null as 'miembro' | null },
    });
    await waitFor(() => expect(result.current.state.status).toBe('success'));
    rerender({ role: 'miembro' });
    expect(result.current.state.status).toBe('loading');
    await waitFor(() => expect(result.current.state.status).toBe('success'));
    expect(mocked).toHaveBeenLastCalledWith(
      { role: 'miembro' },
      { signal: expect.any(AbortSignal) },
    );
  });

  it('un error se puede reintentar', async () => {
    mocked.mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'x'));
    mocked.mockResolvedValue({ items: [], nextCursor: null });
    const { result } = renderHook(() => useGroups());
    await waitFor(() => expect(result.current.state.status).toBe('error'));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.state).toEqual({ status: 'success', items: [] }));
  });

  it('un 401 redirige a /ingresar', async () => {
    mocked.mockRejectedValue(new ApiError(401, 'UNAUTHENTICATED', 'x'));
    const { result } = renderHook(() => useGroups());
    await waitFor(() => expect(result.current.state.status).toBe('redirecting'));
    expect(replace).toHaveBeenCalledWith('/ingresar?next=%2Fgrupos');
  });
});
