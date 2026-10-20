'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui';
import { cx } from '@/components/ui/cx';
import { formatDateTimeLaPaz } from '@/lib/dates';
import { safeInternalLink } from '@/lib/routes';
import type { AppNotification, NotificationCategory } from '@/services/notifications';
import { CATEGORY_LABEL, NOTIFICATION_MESSAGES } from './notification-messages';

/** Icono de cada tipo de aviso (mockup `Notificaciones.dc.html`); decorativo. */
const CATEGORY_ICON: Record<NotificationCategory, { glyph: string; className: string }> = {
  recordatorios: { glyph: 'Bs', className: 'bg-status-pendiente-bg text-status-pendiente-fg' },
  resoluciones: { glyph: '✓', className: 'bg-status-pagado-bg text-status-pagado-fg' },
  titular: { glyph: '↑', className: 'bg-status-en-revision-bg text-status-en-revision-fg' },
  grupo: { glyph: '+', className: 'bg-primary-soft text-primary-hover' },
};

export interface NotificationItemProps {
  notification: AppNotification;
  /** Al abrir el enlace del aviso (por ejemplo, para marcarlo como leído). */
  onOpen?: (notification: AppNotification) => void;
  /** Acción extra al pie, por ejemplo «Marcar como leída». */
  action?: ReactNode;
  compact?: boolean;
}

/**
 * Un aviso (RF-005-01): tipo, título, texto breve, fecha en La Paz y estado «No leída» o
 * «Leída» con texto e icono, no solo con el fondo (RNF-005-06). El título lleva a su `link`
 * cuando es una ruta interna.
 */
export function NotificationItem({
  notification,
  onOpen,
  action,
  compact = false,
}: NotificationItemProps) {
  const unread = notification.readAt === null;
  const href = safeInternalLink(notification.link);
  const icon = CATEGORY_ICON[notification.category];
  return (
    <article
      aria-label={notification.title}
      className={cx(
        'flex gap-3 border-line',
        compact ? 'px-4 py-3' : 'rounded-card border p-4 sm:p-5',
        unread ? 'bg-primary-soft/40' : 'bg-surface',
      )}
    >
      <span
        aria-hidden="true"
        className={cx(
          'flex size-10 shrink-0 items-center justify-center rounded-full font-display font-bold',
          icon.className,
        )}
      >
        {icon.glyph}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="sr-only">{CATEGORY_LABEL[notification.category]}.</span>
        {href ? (
          <Link
            href={href}
            onClick={() => onOpen?.(notification)}
            className={cx(
              'inline-flex min-h-11 items-center text-ink underline-offset-2 hover:underline',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
              unread ? 'font-bold' : 'font-normal',
            )}
          >
            {notification.title}
          </Link>
        ) : (
          <p className={cx('text-ink', unread ? 'font-bold' : 'font-normal')}>
            {notification.title}
          </p>
        )}
        <p className="text-[15px] break-words whitespace-pre-line text-muted">
          {notification.body}
        </p>
        <div className="flex flex-wrap items-center gap-2 text-[15px] text-muted">
          <time dateTime={notification.createdAt}>
            {formatDateTimeLaPaz(notification.createdAt)}
          </time>
          {unread ? (
            <Badge variant="info">{NOTIFICATION_MESSAGES.unread}</Badge>
          ) : (
            <Badge variant="neutral">{NOTIFICATION_MESSAGES.read}</Badge>
          )}
        </div>
        {action}
      </div>
    </article>
  );
}
