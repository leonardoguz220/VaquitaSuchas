'use client';

import { useCallback, useRef, useState } from 'react';
import { requestRegisterLink, type RegisterLinkResponse } from '@/services/auth';
import { toApiError, type ApiError } from '@/services/http';

export type RegisterLinkResult =
  { ok: true; data: RegisterLinkResponse } | { ok: false; error: ApiError };

/**
 * Pedido de un enlace nuevo de verificación (`POST /auth/register/link`, RF-003-21). Devuelve
 * el `ApiError` tal cual para que la pantalla decida por `code` (`429`, `401`, `409`). Ignora un
 * segundo pedido mientras hay uno en curso (cada pedido consume uno de los 5 por hora).
 */
export function useRegisterLink() {
  const [isRequesting, setIsRequesting] = useState(false);
  const inFlight = useRef(false);

  const request = useCallback(async (): Promise<RegisterLinkResult | null> => {
    if (inFlight.current) return null;
    inFlight.current = true;
    setIsRequesting(true);
    try {
      return { ok: true, data: await requestRegisterLink() };
    } catch (caught) {
      return { ok: false, error: toApiError(caught) };
    } finally {
      inFlight.current = false;
      setIsRequesting(false);
    }
  }, []);

  return { request, isRequesting };
}
