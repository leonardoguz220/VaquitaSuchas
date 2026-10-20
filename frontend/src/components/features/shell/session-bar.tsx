'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Logo } from '@/components/features/brand/logo';
import { RequestsNavLink } from '@/components/features/join-requests/requests-nav-link';
import { NotificationBell } from '@/components/features/notifications/notification-bell';
import { isPublicPath } from '@/lib/routes';

/**
 * Barra superior de las pantallas con sesión: logo que lleva al inicio y la campana de
 * notificaciones (spec 005 T012). En las rutas públicas y en `/` (que solo redirige) no se
 * muestra, para no pedir avisos sin sesión. La navegación principal se suma aquí más adelante.
 */
export function SessionBar() {
  const pathname = usePathname() ?? '/';
  if (pathname === '/' || isPublicPath(pathname)) return null;
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 py-2 sm:px-6">
        <Link
          href="/"
          aria-label="Vaquita, ir al inicio"
          className="inline-flex min-h-11 items-center rounded-field focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          <Logo />
        </Link>
        <div className="flex items-center gap-1">
          <RequestsNavLink />
          <NotificationBell />
        </div>
      </div>
    </header>
  );
}
