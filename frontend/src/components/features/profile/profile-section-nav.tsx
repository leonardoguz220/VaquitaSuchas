'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cx } from '@/components/ui/cx';
import { NOTIFICATION_SETTINGS_PATH, PROFILE_PATH, PROFILE_REPUTATION_PATH } from '@/lib/routes';

const SECTIONS = [
  { href: PROFILE_PATH, label: 'Mis datos' },
  { href: PROFILE_REPUTATION_PATH, label: 'Mi reputación' },
  { href: NOTIFICATION_SETTINGS_PATH, label: 'Avisos' },
] as const;

/**
 * Secciones del perfil (mockups `Perfil.dc.html` y `Reputacion.dc.html`): la actual va marcada
 * con `aria-current`, fondo y negrita, no solo con color. En el celular se desplaza en horizontal.
 */
export function ProfileSectionNav() {
  const pathname = usePathname() ?? '';
  return (
    <nav aria-label="Secciones del perfil" className="-mx-1 flex gap-1 overflow-x-auto">
      {SECTIONS.map((section) => {
        const current = pathname === section.href;
        return (
          <Link
            key={section.href}
            href={section.href}
            aria-current={current ? 'page' : undefined}
            className={cx(
              'inline-flex min-h-11 shrink-0 items-center rounded-field px-4 whitespace-nowrap no-underline',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
              current
                ? 'bg-primary-soft font-bold text-primary-hover'
                : 'border border-line bg-surface text-ink hover:bg-bg',
            )}
          >
            {section.label}
          </Link>
        );
      })}
    </nav>
  );
}
