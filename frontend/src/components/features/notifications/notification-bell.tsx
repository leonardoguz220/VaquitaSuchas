'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui';
import { cx } from '@/components/ui/cx';
import {
  announceNotificationsChanged,
  useBellMarkAllRead,
  useBellPreview,
  useUnreadCount,
} from '@/hooks/use-notifications';
import { NOTIFICATIONS_PATH } from '@/lib/routes';
import { markNotificationRead, type AppNotification } from '@/services/notifications';
import { bellCountText, bellLabel, NOTIFICATION_MESSAGES } from './notification-messages';
import { NotificationItem } from './notification-item';

function BellIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-6" fill="none">
      <path
        d="M18 9a6 6 0 1 0-12 0c0 6-2.5 7.5-2.5 7.5h17S18 15 18 9Zm-4.3 11a2 2 0 0 1-3.4 0"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Campana de la barra superior (spec 005 T012, plan §6): botón con el número de no leídas en
 * texto y en el nombre accesible (RNF-005-06), que se actualiza cada 30 s con la pestaña visible;
 * abre un panel con los últimos avisos, «Marcar todas como leídas» y el enlace a
 * `/notificaciones`. Se cierra con Escape o al tocar fuera.
 */
export function NotificationBell() {
  const { count, refresh } = useUnreadCount();
  const preview = useBellPreview();
  const { markAll, isSubmitting, failed } = useBellMarkAllRead();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [open]);

  const toggle = () => {
    if (!open) {
      preview.load();
      refresh();
    }
    setOpen(!open);
  };

  const openNotification = (notification: AppNotification) => {
    setOpen(false);
    if (notification.readAt !== null) return;
    markNotificationRead(notification.id).then(announceNotificationsChanged, () => {
      // Seguirá como no leída; se puede marcar desde /notificaciones.
    });
  };

  const onMarkAll = async () => {
    if (await markAll()) {
      announceNotificationsChanged();
      preview.load();
    }
  };

  const hasUnread = count !== null && count > 0;

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-label={bellLabel(count)}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={toggle}
        className={cx(
          'relative inline-flex min-h-11 min-w-11 items-center justify-center rounded-field text-ink',
          'hover:bg-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
          open && 'bg-primary-soft',
        )}
      >
        <BellIcon />
        {hasUnread && (
          <span
            aria-hidden="true"
            className="absolute top-0.5 right-0.5 inline-flex min-w-5 items-center justify-center rounded-full bg-danger px-1 text-xs leading-5 font-bold text-white"
          >
            {bellCountText(count)}
          </span>
        )}
      </button>

      {open && (
        <div
          id={panelId}
          role="region"
          aria-labelledby={titleId}
          className="absolute top-full right-0 z-40 mt-2 flex w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-card border border-line bg-surface shadow-lg"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
            <h2 id={titleId} className="font-display text-lg font-bold">
              Notificaciones
            </h2>
            <button
              type="button"
              onClick={() => void onMarkAll()}
              disabled={!hasUnread || isSubmitting}
              className="inline-flex min-h-11 items-center rounded-field px-2 font-bold text-primary hover:text-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-60"
            >
              Marcar todas como leídas
            </button>
          </div>
          {failed && (
            <p role="alert" className="px-4 pt-3 text-[15px] font-bold text-danger">
              No pudimos marcar los avisos como leídos. Inténtalo de nuevo.
            </p>
          )}

          {(preview.state.status === 'loading' || preview.state.status === 'idle') && (
            <p role="status" className="px-4 py-6 text-muted">
              Cargando avisos…
            </p>
          )}
          {preview.state.status === 'error' && (
            <div className="flex flex-col gap-2 px-4 py-4">
              <p className="text-ink">{NOTIFICATION_MESSAGES.unexpected}</p>
              <Button variant="secondary" onClick={preview.load}>
                Reintentar
              </Button>
            </div>
          )}
          {preview.state.status === 'success' && preview.state.items.length === 0 && (
            <p className="px-4 py-6 text-muted">No tienes notificaciones.</p>
          )}
          {preview.state.status === 'success' && preview.state.items.length > 0 && (
            <ul
              aria-label="Últimos avisos"
              className="max-h-[60vh] divide-y divide-line overflow-y-auto"
            >
              {preview.state.items.map((notification) => (
                <li key={notification.id}>
                  <NotificationItem notification={notification} onOpen={openNotification} compact />
                </li>
              ))}
            </ul>
          )}

          <Link
            href={NOTIFICATIONS_PATH}
            onClick={() => setOpen(false)}
            className="flex min-h-12 items-center justify-center border-t border-line px-4 font-bold text-primary no-underline hover:bg-bg focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
          >
            Ver todas las notificaciones
          </Link>
        </div>
      )}
    </div>
  );
}
