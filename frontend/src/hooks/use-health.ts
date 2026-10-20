'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getHealth, type HealthResponse } from '@/services/health';

/** Tiempo máximo que la página `/estado` espera a `GET /api/health` (plan 000 §6). */
export const HEALTH_TIMEOUT_MS = 5000;

export type HealthState =
  | { status: 'loading' }
  | { status: 'success'; data: HealthResponse }
  /** La petición falló o tardó más que el tiempo máximo. */
  | { status: 'unreachable' };

export interface UseHealthOptions {
  /** Tiempo máximo en milisegundos; inyectable para las pruebas. */
  timeoutMs?: number;
}

class HealthTimeoutError extends Error {}

/**
 * Consulta `GET /api/health` al montar (RF-000-18). Si la petición falla o tarda más de
 * `timeoutMs`, la cancela con `AbortController` y pasa a `unreachable`. `retry` vuelve a
 * consultar conservando el último resultado hasta que llega el nuevo. Solo muestra lo que
 * responde el backend: no decide el estado del sistema.
 */
export function useHealth({ timeoutMs = HEALTH_TIMEOUT_MS }: UseHealthOptions = {}) {
  const [state, setState] = useState<HealthState>({ status: 'loading' });
  const [isRetrying, setIsRetrying] = useState(false);
  /** Petición vigente; las respuestas de una petición reemplazada o cancelada se ignoran. */
  const current = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    current.current?.abort();
    const controller = new AbortController();
    current.current = controller;

    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new HealthTimeoutError());
      }, timeoutMs);
    });

    let next: HealthState;
    try {
      const data = await Promise.race([getHealth({ signal: controller.signal }), timeout]);
      next = { status: 'success', data };
    } catch {
      next = { status: 'unreachable' };
    } finally {
      clearTimeout(timer);
    }

    if (current.current !== controller) return;
    current.current = null;
    setState(next);
    setIsRetrying(false);
  }, [timeoutMs]);

  useEffect(() => {
    // El estado cambia recién cuando llega la respuesta, no dentro del efecto.
    void load();
    return () => {
      current.current?.abort();
      current.current = null;
    };
  }, [load]);

  const retry = useCallback(() => {
    setIsRetrying(true);
    void load();
  }, [load]);

  return { state, isRetrying, retry };
}
