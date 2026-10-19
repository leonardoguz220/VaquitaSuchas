'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Alert, Button } from '@/components/ui';
import { cx } from '@/components/ui/cx';
import {
  announceNotificationsChanged,
  NOTIFICATIONS_CHANGED_EVENT,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotificationsList,
} from '@/hooks/use-notifications';
import { NOTIFICATION_SETTINGS_PATH } from '@/lib/routes';
import type { ApiError } from '@/services/http';
import type { AppNotification } from '@/services/notifications';
import { NOTIFICATION_MESSAGES, notificationErrorMessage } from './notification-messages';
import { NotificationItem } from './notification-item';

function NotificationsSkeleton() {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-3">
      <span className="sr-only">Cargando tus notificaciones…</span>
      {[0, 1, 2].map((item) => (
        <div
          key={item}
          aria-hidden="true"
          className="flex h-24 items-center gap-4 rounded-card border border-line bg-surface p-5"
        >
          <div className="size-10 animate-pulse rounded-full bg-line motion-reduce:animate-none" />
          <div className="h-5 flex-1 animate-pulse rounded-field bg-line motion-reduce:animate-none" />
        </div>
      ))}
    </div>
  );
}

const filterClass = (pressed: boolean) =>
  cx(
    'inline-flex min-h-11 items-center rounded-full border-[1.5px] px-4 text-body',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
    pressed
      ? 'border-ink bg-ink font-bold text-white'
      : 'border-field-border bg-surface text-ink hover:border-ink',
  );

/**
 * `/notificaciones` (spec 005 T012, plan §6; mockup `Notificaciones.dc.html`): lista paginada de
 * la más reciente a la más antigua, filtro «No leídas» aplicado por la API, cada aviso lleva a
 * su `link` y se puede marcar como leído uno o todos. El contador sale de la API (`unreadCount`).
 * Cubre cargando, vacío, error y con datos.
 */
export function NotificationsView() {
  const [onlyUnread, setOnlyUnread] = useState(false);
  const list = useNotificationsList(onlyUnread);
  const markOne = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const [actionError, setActionError] = useState<{ title: string; error: ApiError } | null>(null);
  const { refresh } = list;

  // La campana u otra acción cambió avisos: se vuelve a pedir la primera página sin parpadeo.
  useEffect(() => {
    const onChanged = () => void refresh();
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, onChanged);
  }, [refresh]);

  const unreadCount = list.firstPage?.unreadCount ?? null;

  const markRead = async (notification: AppNotification) => {
    if (notification.readAt !== null) return;
    setActionError(null);
    const result = await markOne.submit(notification.id);
    if (!result) return;
    if (result.ok) announceNotificationsChanged();
    else setActionError({ title: 'No pudimos marcar el aviso como leído.', error: result.error });
  };

  const onMarkAll = async () => {
    setActionError(null);
    const result = await markAll.submit(undefined);
    if (!result) return;
    if (result.ok) announceNotificationsChanged();
    else
      setActionError({ title: 'No pudimos marcar los avisos como leídos.', error: result.error });
  };

  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-3xl leading-tight font-bold tracking-tight sm:text-4xl">
            Notificaciones
          </h1>
          <p className="text-muted">
            {unreadCount === null
              ? 'Tus avisos de cobros, grupos y solicitudes.'
              : unreadCount === 0
                ? 'No tienes avisos sin leer.'
                : `Tienes ${unreadCount} ${unreadCount === 1 ? 'aviso sin leer' : 'avisos sin leer'}.`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Link
            href={NOTIFICATION_SETTINGS_PATH}
            className="inline-flex min-h-11 items-center font-bold text-primary underline underline-offset-2 hover:text-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            Ajustes de avisos
          </Link>
          <Button
            variant="secondary"
            onClick={() => void onMarkAll()}
            loading={markAll.isSubmitting}
            disabled={unreadCount === 0}
          >
            Marcar todas como leídas
          </Button>
        </div>
      </div>

      <div role="group" aria-label="Filtrar notificaciones" className="flex flex-wrap gap-2">
        <button
          type="button"
          aria-pressed={!onlyUnread}
          onClick={() => setOnlyUnread(false)}
          className={filterClass(!onlyUnread)}
        >
          Todas
        </button>
        <button
          type="button"
          aria-pressed={onlyUnread}
          onClick={() => setOnlyUnread(true)}
          className={filterClass(onlyUnread)}
        >
          {unreadCount === null ? 'No leídas' : `No leídas · ${unreadCount}`}
        </button>
      </div>

      {actionError && (
        <Alert variant="error" title={actionError.title}>
          {notificationErrorMessage(actionError.error)}
        </Alert>
      )}

      {(list.status === 'loading' || list.status === 'redirecting') && <NotificationsSkeleton />}

      {list.status === 'error' && list.error && (
        <Alert
          variant="error"
          title="No pudimos cargar tus notificaciones."
          action={
            <Button variant="secondary" onClick={list.reload}>
              Reintentar
            </Button>
          }
        >
          {notificationErrorMessage(list.error)}
        </Alert>
      )}

      {list.status === 'success' && list.items.length === 0 && (
        <section
          aria-labelledby="notifications-empty-title"
          className="flex flex-col gap-2 rounded-card border border-line bg-surface p-5 sm:p-6"
        >
          <h2 id="notifications-empty-title" className="font-display text-xl font-bold">
            {onlyUnread ? 'No tienes notificaciones sin leer' : 'No tienes notificaciones'}
          </h2>
          <p className="text-muted">
            {onlyUnread
              ? 'Ya leíste todos tus avisos.'
              : 'Aquí verás los avisos de tus cobros, tus grupos y tus solicitudes de ingreso.'}
          </p>
        </section>
      )}

      {list.status === 'success' && list.items.length > 0 && (
        <ul aria-label="Tus notificaciones" className="flex flex-col gap-3">
          {list.items.map((notification) => (
            <li key={notification.id}>
              <NotificationItem
                notification={notification}
                onOpen={(item) => void markRead(item)}
                action={
                  notification.readAt === null ? (
                    <button
                      type="button"
                      aria-label={`Marcar como leída: ${notification.title}`}
                      onClick={() => void markRead(notification)}
                      disabled={markOne.isSubmitting}
                      className="inline-flex min-h-11 items-center self-start rounded-field font-bold text-primary hover:text-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-60"
                    >
                      Marcar como leída
                    </button>
                  ) : null
                }
              />
            </li>
          ))}
        </ul>
      )}

      {list.status === 'success' && list.loadMoreError && (
        <Alert variant="error" title="No pudimos cargar más notificaciones.">
          {notificationErrorMessage(list.loadMoreError)}
        </Alert>
      )}

      {list.status === 'success' && list.hasMore && (
        <Button
          variant="secondary"
          onClick={() => void list.loadMore()}
          loading={list.isLoadingMore}
          className="w-full sm:w-auto sm:self-center"
        >
          Ver más notificaciones
        </Button>
      )}

      <p className="text-[15px] text-muted">{NOTIFICATION_MESSAGES.appAlwaysOn}</p>
    </>
  );
}
