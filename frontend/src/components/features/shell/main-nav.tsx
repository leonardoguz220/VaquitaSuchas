'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { cx } from '@/components/ui/cx';
import { CHARGES_PATH } from '@/components/features/charges/charge-labels';
import { useMe } from '@/hooks/use-me';
import {
  ADMIN_PATH,
  LISTINGS_PATH,
  NOTIFICATION_SETTINGS_PATH,
  PANEL_PATH,
  PROFILE_PATH,
} from '@/lib/routes';

interface NavItem {
  href: string;
  label: string;
}

const GROUPS_PATH = '/grupos';

const USER_ITEMS: NavItem[] = [
  { href: GROUPS_PATH, label: 'Mis suscripciones' },
  { href: PANEL_PATH, label: 'Panel' },
  { href: CHARGES_PATH, label: 'Cobros' },
  { href: LISTINGS_PATH, label: 'Cupos' },
  { href: PROFILE_PATH, label: 'Perfil' },
  { href: NOTIFICATION_SETTINGS_PATH, label: 'Ajustes de avisos' },
];

const ADMIN_ITEM: NavItem = { href: ADMIN_PATH, label: 'Administración' };

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function MenuIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-6" fill="none">
      <path
        d="M4 7h16M4 12h16M4 17h16"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Navegación principal de la barra superior: un menú desplegable con Panel, Cobros, Cupos,
 * Perfil y Ajustes de avisos, más Administración solo si `GET /auth/me` dice que el rol es
 * `admin`. Marca la página actual con `aria-current="page"`; se cierra con Escape (devuelve el
 * foco al botón), al tocar fuera o al elegir un enlace.
 */
export function MainNav() {
  const pathname = usePathname() ?? '/';
  const me = useMe();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const items = me.user?.role === 'admin' ? [...USER_ITEMS, ADMIN_ITEM] : USER_ITEMS;

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

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-label="Menú"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((current) => !current)}
        className="inline-flex size-11 items-center justify-center rounded-field focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        <MenuIcon />
      </button>
      {open && (
        <nav
          id={menuId}
          aria-label="Principal"
          className="absolute right-0 z-20 mt-1 flex w-56 flex-col rounded-field border border-line bg-surface p-1 shadow-lg"
        >
          {items.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                onClick={() => setOpen(false)}
                className={cx(
                  'inline-flex min-h-11 items-center rounded-field px-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink',
                  active ? 'bg-primary-soft font-bold' : 'hover:bg-primary-soft',
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}
