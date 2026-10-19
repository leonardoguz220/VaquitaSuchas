'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { buildLoginRedirect, isPublicPath } from '@/lib/routes';
import { ApiError } from '@/services/http';

/** Indica si el error es un `401` de la API: sin sesión o con la sesión vencida (RF-003-08). */
export function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiError && error.statusCode === 401;
}

interface Navigator {
  replace: (href: string) => void;
}

export interface CurrentLocation {
  pathname: string;
  /** Query actual con su `?` (por ejemplo `window.location.search`), o `''`. */
  search: string;
}

/**
 * Ante un `401` en una pantalla protegida, lleva a `/ingresar?next=<ruta actual>` (plan 003 §6)
 * y devuelve `true`. Con cualquier otro error, o en una pantalla pública (donde un `401` es la
 * respuesta esperada, por ejemplo `INVALID_CREDENTIALS` en `/ingresar`), no hace nada y
 * devuelve `false`. El proxy `/api` ya borró la cookie al recibir el `401` (contrato 000 C).
 */
export function handleUnauthorized(
  error: unknown,
  router: Navigator,
  location: CurrentLocation,
): boolean {
  if (!isUnauthorized(error) || isPublicPath(location.pathname)) return false;
  router.replace(buildLoginRedirect(location.pathname, location.search));
  return true;
}

/**
 * Manejador común del `401` para los hooks de datos de las pantallas protegidas (spec 001 en
 * adelante). La navegación vive aquí y no en `services/http.ts`, que es una capa sin router.
 * Lee la query en el momento del error para no exigir `useSearchParams` (y su `Suspense`).
 */
export function useUnauthorizedRedirect(): (error: unknown) => boolean {
  const router = useRouter();
  const pathname = usePathname();
  return useCallback(
    (error: unknown) =>
      handleUnauthorized(error, router, {
        pathname: pathname ?? window.location.pathname,
        search: window.location.search,
      }),
    [router, pathname],
  );
}
