'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getRegisterStatus, type UserSelf } from '@/services/auth';
import { isConnectionError, toApiError } from '@/services/http';

/** Intervalo del sondeo de `GET /auth/register/status` (contrato 003). */
export const REGISTER_STATUS_POLL_MS = 2000;

/** Lo que la pantalla muestra; sale tal cual de la respuesta del servidor. */
export type RegisterStatusView =
  | { kind: 'loading' }
  | { kind: 'pending'; expiresAt: string }
  | { kind: 'expired' }
  | { kind: 'rejected'; code: string }
  | { kind: 'verified'; user: UserSelf }
  /** `401`: no hay `vq_reg` o el registro venció a las 24 h. */
  | { kind: 'inactive' };

/** Problema transitorio de la última consulta; el sondeo sigue. */
export type RegisterStatusIssue = 'connection' | 'server' | null;

function isFinal(view: RegisterStatusView): boolean {
  return view.kind !== 'loading' && view.kind !== 'pending';
}

function isHidden(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden';
}

/**
 * Sondeo del estado del registro (RF-003-21): consulta al montar y luego cada 2 s mientras el
 * estado sea `pending`. Se detiene en `expired`, `rejected`, `verified`, con `401` y al
 * desmontar; pausa con la pestaña oculta y consulta enseguida al volver. Nunca hay dos
 * peticiones a la vez: la siguiente se programa cuando termina la anterior. Un error de
 * conexión o del servidor no lo detiene: queda en `issue` y se reintenta.
 */
export function useRegisterStatus() {
  const [view, setView] = useState<RegisterStatusView>({ kind: 'loading' });
  const [issue, setIssue] = useState<RegisterStatusIssue>(null);

  const viewRef = useRef<RegisterStatusView>(view);
  const mounted = useRef(false);
  const inFlight = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const checkRef = useRef<() => Promise<void>>(async () => {});

  const updateView = useCallback((next: RegisterStatusView) => {
    viewRef.current = next;
    setView((current) =>
      current.kind === 'pending' && next.kind === 'pending' && current.expiresAt === next.expiresAt
        ? current
        : next,
    );
  }, []);

  const clearTimer = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  /** Programa la próxima consulta si corresponde (visible, montado y sin estado final). */
  const schedule = useCallback(() => {
    clearTimer();
    if (!mounted.current || isHidden() || isFinal(viewRef.current)) return;
    timer.current = setTimeout(() => void checkRef.current(), REGISTER_STATUS_POLL_MS);
  }, [clearTimer]);

  const check = useCallback(async () => {
    if (inFlight.current || !mounted.current) return;
    clearTimer();
    inFlight.current = true;
    try {
      const response = await getRegisterStatus();
      if (!mounted.current) return;
      setIssue(null);
      switch (response.status) {
        case 'pending':
          updateView({ kind: 'pending', expiresAt: response.expiresAt });
          break;
        case 'expired':
          updateView({ kind: 'expired' });
          break;
        case 'rejected':
          updateView({ kind: 'rejected', code: response.code });
          break;
        case 'verified':
          updateView({ kind: 'verified', user: response.user });
          break;
      }
    } catch (caught) {
      if (!mounted.current) return;
      const error = toApiError(caught);
      if (error.statusCode === 401) {
        setIssue(null);
        updateView({ kind: 'inactive' });
      } else {
        setIssue(isConnectionError(error) ? 'connection' : 'server');
      }
    } finally {
      inFlight.current = false;
    }
    schedule();
  }, [clearTimer, schedule, updateView]);

  useEffect(() => {
    checkRef.current = check;
  }, [check]);

  useEffect(() => {
    mounted.current = true;
    // checkRef ya apunta a check (el efecto anterior corre primero); la consulta inicial
    // actualiza el estado recién cuando llega la respuesta, no dentro del efecto.
    void checkRef.current();

    function onVisibilityChange() {
      if (isHidden()) {
        clearTimer();
      } else if (!isFinal(viewRef.current)) {
        void checkRef.current();
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      mounted.current = false;
      clearTimer();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [clearTimer]);

  /** Consulta una vez más ahora (por ejemplo, al llegar la cuenta regresiva a 0). */
  const refresh = useCallback(() => {
    void check();
  }, [check]);

  /** Vuelve a esperar con un enlace nuevo y reanuda el sondeo. */
  const restart = useCallback(
    (expiresAt: string) => {
      updateView({ kind: 'pending', expiresAt });
      schedule();
    },
    [schedule, updateView],
  );

  /** Marca el registro como inactivo (por ejemplo, `401` al pedir un enlace) y detiene el sondeo. */
  const markInactive = useCallback(() => {
    clearTimer();
    setIssue(null);
    updateView({ kind: 'inactive' });
  }, [clearTimer, updateView]);

  return { view, issue, refresh, restart, markInactive };
}
