import { act, renderHook, waitFor } from '@testing-library/react';
import { getGroupCharges } from '@/services/charges';
import { groupChargesPage, MOCK_BILLING_GROUP_IDS } from '@/services/group-billing.mock';
import { ApiError } from '@/services/http';
import { useGroupCharges } from './use-group-charges';

jest.mock('@/services/charges', () => ({ getGroupCharges: jest.fn() }));

const replace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/grupos/abc',
}));

const mocked = jest.mocked(getGroupCharges);
const OWNER = MOCK_BILLING_GROUP_IDS.owner;

beforeEach(() => {
  mocked.mockReset();
  replace.mockReset();
  window.history.replaceState(null, '', '/grupos/abc');
  mocked.mockImplementation(async (groupId, params) => groupChargesPage(groupId, params ?? {}));
});

describe('useGroupCharges (GET /groups/:id/charges)', () => {
  it('RF-002-17: pide 5 por página y «Cargar más» agrega la siguiente con nextCursor', async () => {
    const { result } = renderHook(() => useGroupCharges(OWNER));
    await waitFor(() => expect(result.current.state.status).toBe('success'));
    expect(result.current.state).toMatchObject({ nextCursor: '5' });
    const first = result.current.state;
    expect(first.status === 'success' && first.items).toHaveLength(5);

    act(() => result.current.loadMore());
    await waitFor(() => {
      const state = result.current.state;
      expect(state.status === 'success' && state.items).toHaveLength(8);
    });
    expect(mocked).toHaveBeenLastCalledWith(
      OWNER,
      { limit: 5, cursor: '5' },
      { signal: expect.any(AbortSignal) },
    );
    expect(result.current.state).toMatchObject({ nextCursor: null, moreError: null });
  });

  it('un error de «Cargar más» conserva los ítems', async () => {
    const { result } = renderHook(() => useGroupCharges(OWNER));
    await waitFor(() => expect(result.current.state.status).toBe('success'));
    mocked.mockRejectedValueOnce(new ApiError(503, 'SERVICE_UNAVAILABLE', 'x'));
    act(() => result.current.loadMore());
    await waitFor(() =>
      expect(result.current.state).toMatchObject({
        status: 'success',
        loadingMore: false,
        moreError: expect.any(ApiError),
      }),
    );
    const state = result.current.state;
    expect(state.status === 'success' && state.items).toHaveLength(5);
  });

  it('un error inicial se puede reintentar y un 401 redirige', async () => {
    mocked.mockRejectedValueOnce(new ApiError(500, 'INTERNAL', 'x'));
    const { result } = renderHook(() => useGroupCharges(OWNER));
    await waitFor(() => expect(result.current.state.status).toBe('error'));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.state.status).toBe('success'));

    mocked.mockRejectedValueOnce(new ApiError(401, 'UNAUTHENTICATED', 'x'));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.state.status).toBe('redirecting'));
  });
});
