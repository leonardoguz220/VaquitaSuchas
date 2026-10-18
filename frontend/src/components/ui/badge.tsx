import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';

/** Charge states, exactly as in context/dominio.md and the API contract. */
export type ChargeStatus = 'pendiente' | 'en_revision' | 'pagado' | 'atrasado' | 'cancelado';

/** Generic tones, reused for join requests and other states. */
export type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export type BadgeVariant = ChargeStatus | BadgeTone;

type IconName = 'clock' | 'eye' | 'check' | 'alert' | 'x' | 'info' | 'dot';

interface VariantStyle {
  className: string;
  icon: IconName;
}

// Class names are written in full so Tailwind can detect them.
const styles: Record<BadgeVariant, VariantStyle> = {
  pendiente: { className: 'bg-status-pendiente-bg text-status-pendiente-fg', icon: 'clock' },
  en_revision: { className: 'bg-status-en-revision-bg text-status-en-revision-fg', icon: 'eye' },
  pagado: { className: 'bg-status-pagado-bg text-status-pagado-fg', icon: 'check' },
  atrasado: { className: 'bg-status-atrasado-bg text-status-atrasado-fg', icon: 'alert' },
  cancelado: { className: 'bg-status-cancelado-bg text-status-cancelado-fg', icon: 'x' },
  neutral: { className: 'bg-status-cancelado-bg text-status-cancelado-fg', icon: 'dot' },
  info: { className: 'bg-status-en-revision-bg text-status-en-revision-fg', icon: 'info' },
  success: { className: 'bg-status-pagado-bg text-status-pagado-fg', icon: 'check' },
  warning: { className: 'bg-status-pendiente-bg text-status-pendiente-fg', icon: 'clock' },
  danger: { className: 'bg-status-atrasado-bg text-status-atrasado-fg', icon: 'alert' },
};

/** Visible text of each charge state. */
export const chargeStatusLabel: Record<ChargeStatus, string> = {
  pendiente: 'Pendiente',
  en_revision: 'En revisión',
  pagado: 'Pagado',
  atrasado: 'Atrasado',
  cancelado: 'Cancelado',
};

const iconPaths: Record<IconName, string> = {
  clock: 'M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm.9 3.5v4.1l2.8 2.1-1.1 1.4-3.5-2.6V5.5h1.8Z',
  eye: 'M10 4C5.5 4 2.3 7.4 1.2 10c1.1 2.6 4.3 6 8.8 6s7.7-3.4 8.8-6C17.7 7.4 14.5 4 10 4Zm0 9.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Zm0-2a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z',
  check:
    'M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm3.8 5.3 1.3 1.3-6 6-3.4-3.4 1.3-1.3 2.1 2.1 4.7-4.7Z',
  alert:
    'M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm-.9 3.5h1.8v5.5H9.1V5.5Zm.9 9a1.1 1.1 0 1 1 0-2.2 1.1 1.1 0 0 1 0 2.2Z',
  x: 'M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm2.9 4 1.1 1.1-2.9 2.9 2.9 2.9-1.1 1.1-2.9-2.9L7.1 14 6 12.9 8.9 10 6 7.1 7.1 6 10 8.9 12.9 6Z',
  info: 'M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm0 3a1.1 1.1 0 1 1 0 2.2A1.1 1.1 0 0 1 10 5Zm.9 9.5H9.1V8.5h1.8v6Z',
  dot: 'M10 6a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z',
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant: BadgeVariant;
  /** Visible text. Required for generic tones; charge states default to their label. */
  children?: ReactNode;
}

function isChargeStatus(variant: BadgeVariant): variant is ChargeStatus {
  return variant in chargeStatusLabel;
}

export function Badge({ variant, children, className, ...rest }: BadgeProps) {
  const style = styles[variant];
  const text = children ?? (isChargeStatus(variant) ? chargeStatusLabel[variant] : null);

  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[15px] leading-tight font-bold whitespace-nowrap',
        style.className,
        className,
      )}
      {...rest}
    >
      <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4 shrink-0" fill="currentColor">
        <path fillRule="evenodd" d={iconPaths[style.icon]} />
      </svg>
      {text}
    </span>
  );
}
