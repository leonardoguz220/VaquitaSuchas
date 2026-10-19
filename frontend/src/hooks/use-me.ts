'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getMe, type UserSelf } from '@/services/auth';
import { toApiError, type ApiError } from '@/services/http';
import { useUnauthorizedRedirect } from './use-unauthorized-redirect';

/**
 * `loading`: cargando. `success`: hay usuario. `error`: falló por otra causa (mostrar aviso con
 * Reintentar). `redirecting`: llegó un `401` y se está yendo a `/ingresar?next=…`.
 */
export type MeStatus = 'loading' | 'success' | 'error' | 'redirecting';

export interface MeState {
  status: MeStatus;
  user: UserSelf | null;
  error: ApiError | null;
}

const INITIAL: MeState = { status: 'loading', user: null, error: null };

/**
 * Carga la persona con sesión (`GET /auth/me`, RF-003-08) para las pantallas protegidas. Ante
 * un `401` redirige a `/ingresar?next=<ruta actual>` con `useUnauthorizedRedirect` (plan 003
 * §6); otros errores quedan en `error` para que la pantalla muestre el aviso y `reload`.
 */
export function useMe() {
  const [state, setState] = useState<MeState>(INITIAL);
  const redirectIfUnauthorized = useUnauthorizedRedirect();
  // Se guarda en una ref para que un cambio de ruta no vuelva a pedir los datos.
  const redirectRef = useRef(redirectIfUnauthorized);
  // Cada intento (el primero y cada "Reintentar") vuelve a pedir los datos.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    redirectRef.current = redirectIfUnauthorized;
  }, [redirectIfUnauthorized]);

  useEffect(() => {
    let active = true;
    getMe().then(
      (user) => {
        if (active) setState({ status: 'success', user, error: null });
      },
      (caught: unknown) => {
        if (!active) return;
        const error = toApiError(caught);
        const redirecting = redirectRef.current(error);
        setState({ status: redirecting ? 'redirecting' : 'error', user: null, error });
      },
    );
    return () => {
      active = false;
    };
  }, [attempt]);

  /** Vuelve a pedir `GET /auth/me` (botón "Reintentar"). */
  const reload = useCallback(() => {
    setState(INITIAL);
    setAttempt((current) => current + 1);
  }, []);

  /**
   * Reemplaza la persona por el `UserSelf` que devolvió otra llamada (por ejemplo
   * `PATCH /users/me` o el cambio de celular verificado), sin volver a pedir `GET /auth/me`.
   */
  const replaceUser = useCallback((user: UserSelf) => {
    setState({ status: 'success', user, error: null });
  }, []);

  return { ...state, reload, replaceUser };
}
