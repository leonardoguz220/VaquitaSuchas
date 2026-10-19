'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getUnreadCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type AppNotification,
  type NotificationsPage,
} from '@/services/notifications';
import { useApiSubmit } from './use-api-submit';
import { usePaginatedResource } from './use-paginated-resource';

/** Cada cuánto la campana consulta el contador de no leídas (plan 005 §6). */
export const UNREAD_POLL_MS = 30_000;

/** Avisos por página en `/notificaciones` (contrato 000 A: `limit` de 1 a 100). */
export const NOTIFICATIONS_PAGE_SIZE = 20;

/** Avisos que muestra el panel de la campana. */
export const BELL_PREVIEW_SIZE = 5;

/** Evento del navegador con el que una pantalla avisa a la campana que cambió algo leído. */
export const NOTIFICATIONS_CHANGED_EVENT = 'vaquita:notifications-changed';

/** Pide a la campana que vuelva a consultar el contador (tras marcar avisos como leídos). */
export function announceNotificationsChanged(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
}

function isHidden(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden';
}

/**
 * Contador de no leídas de la campana (RF-005-02): lo consulta al montar y cada 30 s mientras la
 * pestaña esté visible; con la pestaña oculta se pausa y, al volver, consulta enseguida. También
 * consulta cuando otra parte de la app anuncia un cambio. El número lo da el backend; si una
 * consulta falla se conserva el último valor (la campana no bloquea la pantalla).
 */
export function useUnreadCount() {
  const [count, setCount] = useState<number | null>(null);
  const mounted = useRef(true);

  const refresh = useCallback(() => {
    Promise.resolve()
      .then(() => getUnreadCount())
      .then(
        (result) => {
          if (mounted.current) setCount(result.unreadCount);
        },
        () => {
          // Se vuelve a intentar en el próximo sondeo.
        },
      );
  }, []);

  useEffect(() => {
    mounted.current = true;
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer === null) timer = setInterval(refresh, UNREAD_POLL_MS);
    };
    const stop = () => {
      if (timer !== null) clearInterval(timer);
      timer = null;
    };
    const onVisibilityChange = () => {
      if (isHidden()) {
        stop();
      } else {
        refresh();
        start();
      }
    };
    if (!isHidden()) {
      refresh();
      start();
    }
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, refresh);
    return () => {
      mounted.current = false;
      stop();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, refresh);
    };
  }, [refresh]);

  return { count, refresh };
}

export type BellPreviewState =
  | { status: 'idle' | 'loading' }
  | { status: 'error' }
  | { status: 'success'; items: AppNotification[] };

/**
 * Últimos avisos del panel de la campana: se piden al abrirlo (`load`). Sin redirección ante un
 * `401`: de eso se encarga la pantalla; aquí solo se muestra el error con «Reintentar».
 */
export function useBellPreview() {
  const [state, setState] = useState<BellPreviewState>({ status: 'idle' });
  const requestId = useRef(0);

  const load = useCallback(() => {
    const current = ++requestId.current;
    setState({ status: 'loading' });
    Promise.resolve()
      .then(() => listNotifications({ limit: BELL_PREVIEW_SIZE }))
      .then(
        (page) => {
          if (current === requestId.current) setState({ status: 'success', items: page.items });
        },
        () => {
          if (current === requestId.current) setState({ status: 'error' });
        },
      );
  }, []);

  useEffect(
    () => () => {
      // Descarta respuestas que lleguen tras desmontar.
      requestId.current += 1;
    },
    [],
  );

  return { state, load };
}

/**
 * «Marcar todas como leídas» desde la campana (CA-005-22). Sin `useRouter`: la campana vive en
 * la cabecera de toda pantalla y un `401` lo resuelve la pantalla. Devuelve `true` si funcionó.
 */
export function useBellMarkAllRead() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [failed, setFailed] = useState(false);

  const markAll = useCallback(async (): Promise<boolean> => {
    setIsSubmitting(true);
    setFailed(false);
    try {
      await markAllNotificationsRead();
      return true;
    } catch {
      setFailed(true);
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }, []);

  return { markAll, isSubmitting, failed };
}

/**
 * Lista de `/notificaciones` (RF-005-01, RF-005-02): primera página con su `unreadCount`, filtro
 * «No leídas» aplicado por la API y «Ver más» con el cursor.
 */
export function useNotificationsList(onlyUnread: boolean) {
  const loadPage = useCallback(
    (cursor?: string): Promise<NotificationsPage> =>
      listNotifications({
        ...(onlyUnread ? { unread: true } : {}),
        limit: NOTIFICATIONS_PAGE_SIZE,
        ...(cursor ? { cursor } : {}),
      }),
    [onlyUnread],
  );
  return usePaginatedResource(loadPage);
}

/** Marcar un aviso como leído (`POST /notifications/:id/read`). */
export function useMarkNotificationRead() {
  return useApiSubmit(markNotificationRead);
}

/** Marcar todos como leídos (`POST /notifications/read-all`, CA-005-22). */
export function useMarkAllNotificationsRead() {
  const request = useCallback(() => markAllNotificationsRead(), []);
  return useApiSubmit<void, void>(request);
}
