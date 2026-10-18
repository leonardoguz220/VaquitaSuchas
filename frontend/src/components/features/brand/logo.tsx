import { cx } from '@/components/ui/cx';

export interface LogoProps {
  /** `color`: verde sobre fondo claro. `inverse`: claro sobre el panel verde. */
  variant?: 'color' | 'inverse';
  className?: string;
}

/**
 * Logo de Vaquita (mockups `Main.dc.html` y `Registro.dc.html`): el ícono es decorativo y el
 * nombre "vaquita" va como texto, así que el lector de pantalla lee la marca una sola vez.
 */
export function Logo({ variant = 'color', className }: LogoProps) {
  const inverse = variant === 'inverse';
  return (
    <span className={cx('inline-flex items-center gap-2.5', className)}>
      <svg aria-hidden="true" viewBox="0 0 36 36" className="size-9 shrink-0">
        <rect
          x="1"
          y="1"
          width="34"
          height="34"
          rx="11"
          className={inverse ? 'fill-bg' : 'fill-primary'}
        />
        <path
          d="M9 11 L18 26 L27 11"
          fill="none"
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={inverse ? 'stroke-primary' : 'stroke-bg'}
        />
        <circle cx="25.5" cy="25" r="3.2" className={inverse ? 'fill-primary' : 'fill-bg'} />
      </svg>
      <span
        className={cx(
          'font-display text-2xl font-bold tracking-tight',
          inverse ? 'text-bg' : 'text-ink',
        )}
      >
        vaquita
      </span>
    </span>
  );
}
