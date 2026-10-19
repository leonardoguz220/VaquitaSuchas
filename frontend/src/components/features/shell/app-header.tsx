'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { Logo } from '@/components/features/brand/logo';
import { cx } from '@/components/ui/cx';
import { CHARGES_PATH, GROUPS_PATH } from '@/lib/routes';

/** Pantalla "Mi perfil" (spec 003). */
const PROFILE_PATH = '/perfil';

interface NavItem {
  href: string;
  label: string;
}

/** Solo las pantallas que ya existen; las demás (solicitudes, cupos) llegan con sus specs. */
const NAV_ITEMS: NavItem[] = [
  { href: GROUPS_PATH, label: 'Mis suscripciones' },
  { href: CHARGES_PATH, label: 'Mis cobros' },
  { href: PROFILE_PATH, label: 'Mi perfil' },
];

function isCurrent(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Cabecera de las pantallas con sesión (mockup `Grupos.dc.html`): logo que lleva a "Mis
 * suscripciones" y navegación principal con la sección actual marcada con `aria-current` y con
 * fondo y peso de letra (no solo el color). En el celular los enlaces pasan a la línea de abajo.
 */
export function AppHeader() {
  const pathname = usePathname() ?? '';
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex w-full max-w-[1180px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
        <Link
          href={GROUPS_PATH}
          aria-label="Vaquita, ir a Mis suscripciones"
          className="inline-flex min-h-11 items-center rounded-field no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <Logo />
        </Link>
        <nav aria-label="Principal" className="-mx-1 flex flex-1 gap-1 overflow-x-auto">
          {NAV_ITEMS.map((item) => {
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

/** Contenedor de una pantalla con sesión: cabecera y contenido centrado de hasta 1180 px. */
export function AppPage({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <>
      <AppHeader />
      <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-6 px-4 py-6 sm:px-6 sm:py-10">
        {children}
      </div>
    </>
  );
}
