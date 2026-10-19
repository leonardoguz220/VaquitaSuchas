'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { UserSelf } from '@/services/auth';
import { isConnectionError, toApiError, type ApiError } from '@/services/http';
import { getPhoneChangeStatus, startPhoneChange } from '@/services/users';
import { useUnauthorizedRedirect } from './use-unauthorized-redirect';

/** Intervalo del sondeo de `GET /users/me/phone-change/status` (igual que el registro). */
export const PHONE_CHANGE_POLL_MS = 2000;

/** Lo que muestra la sección; sale tal cual de las respuestas del servidor. */
export type PhoneChangeView =
  /** No hay un cambio en curso en esta pantalla. */
  | { kind: 'idle' }
  /** Se está pidiendo el primer enlace. */
  | { kind: 'starting' }
  | { kind: 'pending'; telegramUrl: string; expiresAt: string }
  | { kind: 'expired' }
  | { kind: 'rejected'; code: string | null }
  /** `user` puede faltar si el servidor no lo envía; entonces la pantalla vuelve a pedir `/auth/me`. */
  | { kind: 'verified'; user: UserSelf | null };

/** Problema transitorio de la última consulta; el sondeo sigue. */
export type PhoneChangeIssue = 'connection' | 'server' | null;

function isHidden(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden';
}

/**
 * Cambio de celular con el bot de Telegram (RF-003-14, CA-003-32). `start` pide el enlace
 * (`POST /users/me/phone-change`) y empieza a consultar el estado cada 2 s mientras sea
 * `pending`, con el mismo patrón que el registro: nunca dos consultas a la vez, se detiene en
 * `expired`, `rejected` y `verified`, pausa con la pestaña oculta y un error de conexión o del
 * servidor queda en `issue` y se reintenta. `cancel` deja de esperar y descarta las respuestas
 * que lleguen tarde. Un `401` lleva a `/ingresar?next=/perfil`.
 */
export function usePhoneChange() {
  const [view, setView] = useState<PhoneChangeView>({ kind: 'idle' });
  const [issue, setIssue] = useState<PhoneChangeIssue>(null);
  const [startError, setStartError] = useState<ApiError | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const redirectIfUnauthorized = useUnauthorizedRedirect();

  const viewRef = useRef<PhoneChangeView>(view);
  const mounted = useRef(false);
  const inFlight = useRef(false);
  const starting = useRef(false);
  /** Cambia al cancelar o al pedir un enlace: las respuestas de antes se descartan. */
  const generation = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const checkRef = useRef<() => Promise<void>>(async () => {});
  const redirectRef = useRef(redirectIfUnauthorized);

  useEffect(() => {
    redirectRef.current = redirectIfUnauthorized;
  }, [redirectIfUnauthorized]);

  const updateView = useCallback((next: PhoneChangeView) => {
    viewRef.current = next;
    setView(next);
  }, []);

  const clearTimer = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  /** Programa la próxima consulta si corresponde (montado, visible y esperando). */
  const schedule = useCallback(() => {
    clearTimer();
    if (!mounted.current || isHidden() || viewRef.current.kind !== 'pending') return;
    timer.current = setTimeout(() => void checkRef.current(), PHONE_CHANGE_POLL_MS);
  }, [clearTimer]);

  const check = useCallback(async () => {
    if (inFlight.current || !mounted.current || viewRef.current.kind !== 'pending') return;
    clearTimer();
    const current = generation.current;
    inFlight.current = true;
    let redirecting = false;
    try {
      const response = await getPhoneChangeStatus();
      if (!mounted.current || current !== generation.current) return;
      setIssue(null);
      switch (response.status) {
        case 'pending':
          break;
        case 'expired':
          updateView({ kind: 'expired' });
          break;
        case 'rejected':
          updateView({ kind: 'rejected', code: response.code ?? null });
          break;
        case 'verified':
          updateView({ kind: 'verified', user: response.user ?? null });
          break;
      }
    } catch (caught) {
      if (!mounted.current || current !== generation.current) return;
      const error = toApiError(caught);
      redirecting = redirectRef.current(error);
      if (!redirecting) setIssue(isConnectionError(error) ? 'connection' : 'server');
    } finally {
      inFlight.current = false;
      // También tras una respuesta descartada: un enlace nuevo puede estar esperando.
      if (!redirecting) schedule();
    }
  }, [clearTimer, schedule, updateView]);

  useEffect(() => {
    checkRef.current = check;
  }, [check]);

  useEffect(() => {
    mounted.current = true;
    function onVisibilityChange() {
      if (isHidden()) clearTimer();
      else if (viewRef.current.kind === 'pending') void checkRef.current();
    }
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      mounted.current = false;
      clearTimer();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [clearTimer]);

  /** Pide un enlace (el primero o uno nuevo tras vencer o un rechazo) y empieza a esperar. */
  const start = useCallback(async () => {
    if (starting.current) return;
    starting.current = true;
    generation.current += 1;
    const current = generation.current;
    clearTimer();
    setIsStarting(true);
    setStartError(null);
    setIssue(null);
    // Con el enlace vencido la tarjeta sigue a la vista y su botón muestra que está cargando.
    if (viewRef.current.kind !== 'expired') updateView({ kind: 'starting' });
    try {
      const { verification } = await startPhoneChange();
      if (!mounted.current || current !== generation.current) return;
      updateView({
        kind: 'pending',
        telegramUrl: verification.telegramUrl,
        expiresAt: verification.expiresAt,
      });
      schedule();
    } catch (caught) {
      if (!mounted.current || current !== generation.current) return;
      const error = toApiError(caught);
      if (redirectRef.current(error)) return;
      setStartError(error);
      if (viewRef.current.kind === 'starting') updateView({ kind: 'idle' });
    } finally {
      starting.current = false;
      if (mounted.current) setIsStarting(false);
    }
  }, [clearTimer, schedule, updateView]);

  /** Deja de esperar y oculta la verificación; el celular anterior sigue vigente (CA-003-32). */
  const cancel = useCallback(() => {
    generation.current += 1;
    clearTimer();
    setIssue(null);
    setStartError(null);
    updateView({ kind: 'idle' });
  }, [clearTimer, updateView]);

  /** Consulta una vez más ahora (por ejemplo, al llegar la cuenta regresiva a 0). */
  const refresh = useCallback(() => {
    void check();
  }, [check]);

  return { view, issue, startError, isStarting, start, cancel, refresh };
}
