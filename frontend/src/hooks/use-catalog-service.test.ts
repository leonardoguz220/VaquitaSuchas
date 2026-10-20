import { act, renderHook, waitFor } from '@testing-library/react';
import { netflixDetail, tigoPlayDetail } from '@/components/features/catalog/__fixtures__/catalog';
import { getService } from '@/services/catalog';
import { ApiError } from '@/services/http';
import { useCatalogService } from './use-catalog-service';

jest.mock('@/services/catalog', () => ({
  ...jest.requireActual('@/services/catalog'),
  getService: jest.fn(),
}));

const replace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/grupos/nuevo',
}));

const mockedGet = jest.mocked(getService);

beforeEach(() => {
  mockedGet.mockReset();
  replace.mockReset();
  window.history.replaceState(null, '', '/grupos/nuevo');
});

describe('useCatalogService (RF-004-05, plan 004 §6)', () => {
  it('RF-004-05: sin slug queda inactivo y no pide nada', () => {
    const { result } = renderHook(() => useCatalogService(null));
    expect(result.current.state.status).toBe('idle');
    expect(mockedGet).not.toHaveBeenCalled();
  });

  it('CA-004-04: con slug carga el detalle y entrega los planes tal como vienen', async () => {
    mockedGet.mockResolvedValue(netflixDetail);
    const { result } = renderHook(() => useCatalogService('netflix'));

    expect(result.current.state.status).toBe('loading');
    await waitFor(() => expect(result.current.state.status).toBe('success'));
    expect(result.current.state).toMatchObject({
      service: netflixDetail.service,
      plans: netflixDetail.plans,
    });
    expect(mockedGet).toHaveBeenCalledWith('netflix', { signal: expect.any(AbortSignal) });
  });

  it('RF-004-05: un 404 queda como not_found (servicio inactivo o sin planes activos)', async () => {
    mockedGet.mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'No existe.'));
    const { result } = renderHook(() => useCatalogService('netflix'));
    await waitFor(() => expect(result.current.state.status).toBe('not_found'));
  });

  it('RF-004-05: otros errores quedan en error y retry vuelve a pedir el detalle', async () => {
    mockedGet.mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'x'));
    const { result } = renderHook(() => useCatalogService('netflix'));
    await waitFor(() => expect(result.current.state.status).toBe('error'));

    mockedGet.mockResolvedValueOnce(netflixDetail);
    act(() => result.current.retry());
    expect(result.current.state.status).toBe('loading');
    await waitFor(() => expect(result.current.state.status).toBe('success'));
  });

  it('CA-004-09: un 401 redirige a /ingresar?next=/grupos/nuevo', async () => {
    mockedGet.mockRejectedValue(new ApiError(401, 'UNAUTHENTICATED', 'Inicia sesión.'));
    const { result } = renderHook(() => useCatalogService('netflix'));
    await waitFor(() => expect(result.current.state.status).toBe('redirecting'));
    expect(replace).toHaveBeenCalledWith('/ingresar?next=%2Fgrupos%2Fnuevo');
  });

  it('RF-004-05: al cambiar de servicio vuelve a cargando y no muestra el detalle anterior', async () => {
    mockedGet.mockResolvedValueOnce(netflixDetail);
    const { result, rerender } = renderHook(({ slug }) => useCatalogService(slug), {
      initialProps: { slug: 'netflix' as string | null },
    });
    await waitFor(() => expect(result.current.state.status).toBe('success'));

    mockedGet.mockResolvedValueOnce(tigoPlayDetail);
    rerender({ slug: 'tigo-play' });
    expect(result.current.state.status).toBe('loading');
    await waitFor(() =>
      expect(result.current.state).toMatchObject({
        status: 'success',
        service: tigoPlayDetail.service,
      }),
    );
  });

  it('RF-004-05: ignora la respuesta de un servicio que ya no está elegido', async () => {
    let resolveFirst: (value: typeof netflixDetail) => void = () => {};
    mockedGet.mockImplementationOnce(() => new Promise((resolve) => (resolveFirst = resolve)));
    const { result, rerender } = renderHook(({ slug }) => useCatalogService(slug), {
      initialProps: { slug: 'netflix' as string | null },
    });

    mockedGet.mockResolvedValueOnce(tigoPlayDetail);
    rerender({ slug: 'tigo-play' });
    await waitFor(() => expect(result.current.state.status).toBe('success'));

    await act(async () => resolveFirst(netflixDetail));
    expect(result.current.state).toMatchObject({ service: tigoPlayDetail.service });
  });
});
