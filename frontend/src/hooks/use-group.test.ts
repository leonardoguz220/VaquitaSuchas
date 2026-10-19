import { renderHook, waitFor } from '@testing-library/react';
import { memberGroup } from '@/components/features/groups/__fixtures__/groups';
import { getGroup } from '@/services/groups';
import { ApiError } from '@/services/http';
import { useGroup } from './use-group';

jest.mock('@/services/groups', () => ({ getGroup: jest.fn() }));

const replace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/grupos/abc',
}));

const mocked = jest.mocked(getGroup);

beforeEach(() => {
  mocked.mockReset();
  replace.mockReset();
  window.history.replaceState(null, '', '/grupos/abc');
});

describe('useGroup (GET /groups/:groupId)', () => {
  it('entrega el detalle de la API', async () => {
    mocked.mockResolvedValue(memberGroup);
    const { result } = renderHook(() => useGroup(memberGroup.id));
    expect(result.current.state.status).toBe('loading');
    await waitFor(() =>
      expect(result.current.state).toEqual({ status: 'success', group: memberGroup }),
    );
    expect(mocked).toHaveBeenCalledWith(memberGroup.id, { signal: expect.any(AbortSignal) });
  });

  it('CA-001-10: un 404 (grupo ajeno) queda como not_found y no como error', async () => {
    mocked.mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'x'));
    const { result } = renderHook(() => useGroup('ajeno'));
    await waitFor(() => expect(result.current.state).toEqual({ status: 'not_found' }));
  });

  it('un 401 redirige a /ingresar', async () => {
    mocked.mockRejectedValue(new ApiError(401, 'UNAUTHENTICATED', 'x'));
    const { result } = renderHook(() => useGroup('abc'));
    await waitFor(() => expect(result.current.state.status).toBe('redirecting'));
    expect(replace).toHaveBeenCalledWith('/ingresar?next=%2Fgrupos%2Fabc');
  });
});
