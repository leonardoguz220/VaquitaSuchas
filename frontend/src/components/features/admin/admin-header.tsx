'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { Logo } from '@/components/features/brand/logo';
import { cx } from '@/components/ui/cx';
import { ADMIN_USERS_PATH, GROUPS_PATH } from '@/lib/routes';

interface AdminNavItem {
  href: string;
  label: string;
}

/** Secciones del panel de administración (plan 009 §6; mockup `AdminUsuarios.dc.html`). */
export const ADMIN_NAV_ITEMS: AdminNavItem[] = [{ href: ADMIN_USERS_PATH, label: 'Usuarios' }];

function isCurrent(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Cabecera del panel de administración: logo con la marca «admin», navegación entre secciones
 * con la actual marcada con `aria-current`, fondo y peso de letra (no solo el color) y enlace de
 * vuelta a la app. En el celular los enlaces pasan a una línea con desplazamiento horizontal.
 * Ocultar un enlace no es seguridad: el layout de `/admin` comprueba el rol en el servidor y la
 * API responde `403` (RNF-009-01).
 */
export function AdminHeader() {
  const pathname = usePathname() ?? '';
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex w-full max-w-[1180px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
        <Link
          href={ADMIN_NAV_ITEMS[0].href}
          aria-label="Vaquita admin, ir a Usuarios"
          className="inline-flex min-h-11 items-center gap-2 rounded-field no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <Logo />
          <span className="rounded-full bg-ink px-2 py-0.5 text-[13px] font-bold tracking-wide text-white uppercase">
            admin
          </span>
        </Link>
        <Link
          href={GROUPS_PATH}
          className="ml-auto inline-flex min-h-11 items-center rounded-field px-3 text-[15px] font-bold sm:order-last sm:ml-0"
        >
          Volver a Vaquita
        </Link>
        <nav
          aria-label="Administración"
          className="-mx-1 order-last flex w-full gap-1 overflow-x-auto sm:order-none sm:w-auto sm:flex-1"
        >
          {ADMIN_NAV_ITEMS.map((item) => {
            const current = isCurrent(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={current ? 'page' : undefined}
                className={cx(
                  'inline-flex min-h-11 shrink-0 items-center rounded-field px-4 whitespace-nowrap no-underline',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
                  current ? 'bg-primary-soft font-bold text-primary-hover' : 'text-ink hover:bg-bg',
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}

/** Contenedor de una pantalla de administración: cabecera y contenido de hasta 1180 px. */
export function AdminPage({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <>
      <AdminHeader />
      <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-6 px-4 py-6 sm:px-6 sm:py-10">
        {children}
      </div>
    </>
  );
}
