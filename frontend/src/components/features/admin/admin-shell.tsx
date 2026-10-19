'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { cx } from '@/components/ui/cx';
import {
  ADMIN_CATALOG_PATH,
  ADMIN_DISPUTES_PATH,
  ADMIN_HOSTS_PATH,
  ADMIN_PATH,
  ADMIN_USERS_PATH,
} from '@/lib/routes';
import { AdminGate } from './admin-gate';

/** Secciones del panel que ya existen; el resto de la spec 009 se suma en sus propias tareas. */
const SECTIONS = [
  { href: ADMIN_PATH, label: 'Tablero' },
  { href: ADMIN_USERS_PATH, label: 'Usuarios' },
  { href: ADMIN_HOSTS_PATH, label: 'Titulares' },
  { href: ADMIN_DISPUTES_PATH, label: 'Reclamos' },
  { href: ADMIN_CATALOG_PATH, label: 'Catálogo' },
] as const;

function isActive(pathname: string, href: string): boolean {
  if (href === ADMIN_PATH) return pathname === ADMIN_PATH;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Marco de todas las pantallas `/admin` (plan 009 §6): cabecera oscura con la navegación de la
 * administración. Todo el marco pasa por `AdminGate`, así que un usuario normal no ve ni el menú.
 */
export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <AdminGate>
      <div className="flex min-h-screen flex-col bg-bg text-ink">
        <header className="flex flex-wrap items-center gap-3 bg-ink px-4 py-3 text-bg sm:px-8">
          <span className="font-display text-xl font-bold">
            vaquita <span className="text-sm font-semibold text-line">admin</span>
          </span>
          <nav aria-label="Administración" className="flex flex-1 flex-wrap gap-1">
            {SECTIONS.map((section) => {
              const active = isActive(pathname, section.href);
              return (
                <Link
                  key={section.href}
                  href={section.href}
                  aria-current={active ? 'page' : undefined}
                  className={cx(
                    'inline-flex min-h-11 items-center rounded-field px-3 font-bold no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bg',
                    active ? 'bg-[#2E3A35] text-white' : 'text-line hover:text-white',
                  )}
                >
                  {section.label}
                </Link>
              );
            })}
          </nav>
        </header>
        <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-6 sm:px-8 sm:py-10">
          {children}
        </main>
      </div>
    </AdminGate>
  );
}
