import { act, renderHook, waitFor } from '@testing-library/react';
import {
  catalogCategories,
  catalogServices,
  netflix,
  spotify,
  tigoPlay,
} from '@/components/features/catalog/__fixtures__/catalog';
import { CATALOG_PAGE_SIZE, listCategories, listServices } from '@/services/catalog';
import { ApiError } from '@/services/http';
import { useCatalogServices } from './use-catalog-services';

jest.mock('@/services/catalog', () => ({
  ...jest.requireActual('@/services/catalog'),
  listServices: jest.fn(),
  listCategories: jest.fn(),
}));

const replace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/grupos/nuevo',
}));

const mockedList = jest.mocked(listServices);
const mockedCategories = jest.mocked(listCategories);

beforeEach(() => {
  mockedList.mockReset();
  mockedCategories.mockReset();
  mockedCategories.mockResolvedValue({ items: catalogCategories });
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

describe('useCatalogServices: búsqueda, categoría y categorías (T016)', () => {
  it('CA-004-03: espera 250 ms tras la última tecla antes de pedir la búsqueda', () => {
    jest.useFakeTimers();
    try {
      mockedList.mockResolvedValue({ items: [netflix], nextCursor: null });
      const { result } = renderHook(() => useCatalogServices());

      act(() => result.current.setQuery('n'));
      act(() => jest.advanceTimersByTime(200));
      act(() => result.current.setQuery('netflix'));
      act(() => jest.advanceTimersByTime(249));
      expect(mockedList).toHaveBeenCalledTimes(1);

      act(() => jest.advanceTimersByTime(1));
      expect(mockedList).toHaveBeenCalledTimes(2);
      expect(mockedList).toHaveBeenLastCalledWith(
        { q: 'netflix' },
        { signal: expect.any(AbortSignal) },
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('CA-004-03: la búsqueda envía el texto sin espacios sobrantes y sin q si queda vacío', async () => {
    mockedList.mockResolvedValue({ items: [netflix], nextCursor: null });
    const { result } = renderHook(() => useCatalogServices());
    await waitFor(() => expect(result.current.state.status).toBe('success'));

    act(() => result.current.setQuery('  música  '));
    await waitFor(() =>
      expect(mockedList).toHaveBeenLastCalledWith(
        { q: 'música' },
        { signal: expect.any(AbortSignal) },
      ),
    );

    act(() => result.current.setQuery('   '));
    await waitFor(() =>
      expect(mockedList).toHaveBeenLastCalledWith(
        { q: undefined },
        { signal: expect.any(AbortSignal) },
      ),
    );
  });

  it('CA-004-02: elegir una categoría vuelve a pedir la lista filtrada y muestra su resultado', async () => {
    mockedList.mockResolvedValueOnce({ items: catalogServices, nextCursor: null });
    const { result } = renderHook(() => useCatalogServices());
    await waitFor(() => expect(result.current.state.status).toBe('success'));

    mockedList.mockResolvedValueOnce({ items: [spotify], nextCursor: null });
    act(() => result.current.setCategory('musica'));
    expect(result.current.state.status).toBe('loading');
    expect(mockedList).toHaveBeenLastCalledWith(
      { category: 'musica' },
      { signal: expect.any(AbortSignal) },
    );
    await waitFor(() =>
      expect(result.current.state).toMatchObject({ status: 'success', items: [spotify] }),
    );
    expect(result.current.category).toBe('musica');
  });

  it('CA-004-02: «Ver más» conserva la categoría y la búsqueda activas', async () => {
    mockedList.mockResolvedValue({ items: [netflix], nextCursor: 'c1' });
    const { result } = renderHook(() => useCatalogServices());
    await waitFor(() => expect(result.current.state.status).toBe('success'));

    act(() => result.current.setCategory('video'));
    await waitFor(() => expect(result.current.state.status).toBe('success'));

    mockedList.mockResolvedValueOnce({ items: [tigoPlay], nextCursor: null });
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.state).toMatchObject({ nextCursor: null }));
    expect(mockedList).toHaveBeenLastCalledWith(
      { category: 'video', q: undefined, cursor: 'c1', limit: CATALOG_PAGE_SIZE },
      { signal: expect.any(AbortSignal) },
    );
  });

  it('RF-004-03: carga las categorías de GET /catalog/categories para los chips', async () => {
    mockedList.mockResolvedValue({ items: catalogServices, nextCursor: null });
    const { result } = renderHook(() => useCatalogServices());

    expect(result.current.categories.status).toBe('loading');
    await waitFor(() => expect(result.current.categories.status).toBe('success'));
    expect(result.current.categories).toEqual({ status: 'success', items: catalogCategories });
    expect(mockedCategories).toHaveBeenCalledTimes(1);
  });

  it('RF-004-03: si fallan las categorías la lista sigue funcionando', async () => {
    mockedCategories.mockRejectedValueOnce(new ApiError(500, 'INTERNAL_ERROR', 'x'));
    mockedList.mockResolvedValue({ items: catalogServices, nextCursor: null });
    const { result } = renderHook(() => useCatalogServices());

    await waitFor(() => expect(result.current.categories.status).toBe('error'));
    expect(result.current.state).toMatchObject({ status: 'success', items: catalogServices });
  });
});
