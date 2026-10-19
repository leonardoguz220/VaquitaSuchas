'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useRef, useState } from 'react';
import { LOGIN_PATH } from '@/lib/routes';
import { changePassword, logout } from '@/services/auth';
import { updateMe } from '@/services/users';
import { useApiSubmit } from './use-api-submit';

/** `PATCH /users/me` con `{ fullName }` (RF-003-14). */
export function useUpdateName() {
  return useApiSubmit(updateMe);
}

/** `POST /auth/password/change` (RF-003-15). */
export function useChangePassword() {
  return useApiSubmit(changePassword);
}

/**
 * Cierre de sesión (RF-003-07): llama a `POST /auth/logout` y luego va a `/ingresar` aunque el
 * backend falle o no responda, porque el proxy borra la cookie igual (contrato 000 C).
 */
export function useLogout() {
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const inFlight = useRef(false);

  const logOut = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setIsLoggingOut(true);
    try {
      await logout();
    } catch {
      // Sin aviso: la sesión local ya no sirve y el proxy borró la cookie.
    }
    router.replace(LOGIN_PATH);
  }, [router]);

  return { logOut, isLoggingOut };
}
