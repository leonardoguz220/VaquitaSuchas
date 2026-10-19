import { renderHook } from '@testing-library/react';
import { ApiError } from '@/services/http';
import {
  handleUnauthorized,
  isUnauthorized,
  useUnauthorizedRedirect,
} from './use-unauthorized-redirect';

const replace = jest.fn();
const router = { replace };
let pathname = '/grupos/1';
jest.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => pathname,
}));

const unauthenticated = new ApiError(401, 'UNAUTHENTICATED', 'Inicia sesión.');

beforeEach(() => {
  replace.mockReset();
  pathname = '/grupos/1';
  window.history.replaceState(null, '', '/grupos/1');
});

describe('handleUnauthorized (RF-003-08, plan 003 §6)', () => {
  it('RF-003-08: un 401 en una pantalla protegida redirige a /ingresar?next=<ruta y query>', () => {
    const handled = handleUnauthorized(unauthenticated, router, {
      pathname: '/grupos/1',
      search: '?tab=cobros',
    });
    expect(handled).toBe(true);
    expect(replace).toHaveBeenCalledWith('/ingresar?next=%2Fgrupos%2F1%3Ftab%3Dcobros');
  });

  it('RF-003-08: un 401 en la raíz redirige a /ingresar sin next=', () => {
    handleUnauthorized(unauthenticated, router, { pathname: '/', search: '' });
    expect(replace).toHaveBeenCalledWith('/ingresar');
  });

  it.each([
    new ApiError(403, 'FORBIDDEN', 'x'),
    new ApiError(404, 'NOT_FOUND', 'x'),
    new ApiError(500, 'INTERNAL_ERROR', 'x'),
    new ApiError(503, 'SERVICE_UNAVAILABLE', 'x'),
    new ApiError(0, 'NETWORK_ERROR', 'x'),
    new Error('otro'),
  ])('RF-003-08: otros errores no redirigen (%s)', (error) => {
    expect(handleUnauthorized(error, router, { pathname: '/grupos', search: '' })).toBe(false);
    expect(replace).not.toHaveBeenCalled();
  });

  it('RNF-003-02: un 401 INVALID_CREDENTIALS en /ingresar no redirige (pantalla pública)', () => {
    const error = new ApiError(401, 'INVALID_CREDENTIALS', 'Correo o contraseña incorrectos.');
    expect(handleUnauthorized(error, router, { pathname: '/ingresar', search: '' })).toBe(false);
    expect(replace).not.toHaveBeenCalled();
  });

  it('RF-003-08: isUnauthorized solo es verdadero para un ApiError 401', () => {
    expect(isUnauthorized(unauthenticated)).toBe(true);
    expect(isUnauthorized(new ApiError(403, 'FORBIDDEN', 'x'))).toBe(false);
    expect(isUnauthorized({ statusCode: 401 })).toBe(false);
  });
});

describe('useUnauthorizedRedirect (RF-003-08)', () => {
  it('RF-003-08: usa la ruta actual y la query del navegador para next=', () => {
    pathname = '/grupos/1';
    window.history.replaceState(null, '', '/grupos/1?tab=cobros');
    const { result } = renderHook(() => useUnauthorizedRedirect());

    expect(result.current(unauthenticated)).toBe(true);
    expect(replace).toHaveBeenCalledWith('/ingresar?next=%2Fgrupos%2F1%3Ftab%3Dcobros');
  });

  it('RF-003-08: con otro error no navega', () => {
    const { result } = renderHook(() => useUnauthorizedRedirect());
    expect(result.current(new ApiError(500, 'INTERNAL_ERROR', 'x'))).toBe(false);
    expect(replace).not.toHaveBeenCalled();
  });
});
