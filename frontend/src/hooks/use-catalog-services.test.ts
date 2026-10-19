import { act, renderHook, waitFor } from '@testing-library/react';
import {
  catalogServices,
  netflix,
  spotify,
  tigoPlay,
} from '@/components/features/catalog/__fixtures__/catalog';
import { CATALOG_PAGE_SIZE, listServices } from '@/services/catalog';
import { ApiError } from '@/services/http';
import { useCatalogServices } from './use-catalog-services';

jest.mock('@/services/catalog', () => ({
  ...jest.requireActual('@/services/catalog'),
  listServices: jest.fn(),
}));

const replace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/grupos/nuevo',
}));

const mockedList = jest.mocked(listServices);

beforeEach(() => {
  mockedList.mockReset();
  replace.mockReset();
  window.history.replaceState(null, '', '/grupos/nuevo');
});

describe('useCatalogServices (RF-004-04, plan 004 §6)', () => {
  it('RF-004-04: empieza cargando y pasa a success con los servicios en el orden de la API', async () => {
    mockedList.mockResolvedValue({ items: catalogServices, nextCursor: null });
    const { result } = renderHook(() => useCatalogServices());

    expect(result.current.state.status).toBe('loading');
    await waitFor(() => expect(result.current.state.status).toBe('success'));
    expect(result.current.state).toMatchObject({ items: catalogServices, nextCursor: null });
    expect(mockedList).toHaveBeenCalledWith({}, { signal: expect.any(AbortSignal) });
  });

  it('RF-004-04: un error que no es 401 queda en error y retry vuelve a pedir la lista', async () => {
    mockedList.mockRejectedValueOnce(new ApiError(500, 'INTERNAL_ERROR', 'x'));
    const { result } = renderHook(() => useCatalogServices());
    await waitFor(() => expect(result.current.state.status).toBe('error'));
    expect(replace).not.toHaveBeenCalled();

    mockedList.mockResolvedValueOnce({ items: [netflix], nextCursor: null });
    act(() => result.current.retry());
    expect(result.current.state.status).toBe('loading');
    await waitFor(() => expect(result.current.state.status).toBe('success'));
    expect(mockedList).toHaveBeenCalledTimes(2);
  });

  it('CA-004-09: un 401 redirige a /ingresar?next=/grupos/nuevo y no muestra error', async () => {
    mockedList.mockRejectedValue(new ApiError(401, 'UNAUTHENTICATED', 'Inicia sesión.'));
    const { result } = renderHook(() => useCatalogServices());

    await waitFor(() => expect(result.current.state.status).toBe('redirecting'));
    expect(replace).toHaveBeenCalledWith('/ingresar?next=%2Fgrupos%2Fnuevo');
  });

  it('RF-004-04: loadMore pide la página siguiente con el cursor y agrega los servicios', async () => {
    mockedList.mockResolvedValueOnce({ items: [netflix], nextCursor: 'c1' });
    const { result } = renderHook(() => useCatalogServices());
    await waitFor(() => expect(result.current.state.status).toBe('success'));

    mockedList.mockResolvedValueOnce({ items: [spotify, tigoPlay], nextCursor: null });
    act(() => result.current.loadMore());
    expect(result.current.isLoadingMore).toBe(true);
    await waitFor(() => expect(result.current.isLoadingMore).toBe(false));

    expect(mockedList).toHaveBeenLastCalledWith(
      { cursor: 'c1', limit: CATALOG_PAGE_SIZE },
      { signal: expect.any(AbortSignal) },
    );
    expect(result.current.state).toMatchObject({
      status: 'success',
      items: [netflix, spotify, tigoPlay],
      nextCursor: null,
    });
  });

  it('RF-004-04: si loadMore falla conserva la lista y avisa con loadMoreFailed', async () => {
    mockedList.mockResolvedValueOnce({ items: [netflix], nextCursor: 'c1' });
    const { result } = renderHook(() => useCatalogServices());
    await waitFor(() => expect(result.current.state.status).toBe('success'));

    mockedList.mockRejectedValueOnce(new ApiError(503, 'SERVICE_UNAVAILABLE', 'x'));
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.loadMoreFailed).toBe(true));
    expect(result.current.state).toMatchObject({ items: [netflix], nextCursor: 'c1' });
  });

  it('RF-004-04: al desmontar cancela la petición en curso', async () => {
    let signal: AbortSignal | undefined;
    mockedList.mockImplementation((_params, options) => {
      signal = options?.signal;
      return new Promise(() => {});
    });
    const { unmount } = renderHook(() => useCatalogServices());
    await waitFor(() => expect(signal).toBeDefined());

    unmount();
    expect(signal?.aborted).toBe(true);
  });
});
