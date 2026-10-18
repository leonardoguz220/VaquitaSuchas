import Link from 'next/link';
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode, Ref } from 'react';
import { cx } from './cx';

export type ButtonVariant = 'primary' | 'secondary' | 'danger';

// min-h-12 = 48 px (touch target >= 44 px). rounded-field = 12 px.
const base =
  'inline-flex min-h-12 items-center justify-center gap-2 rounded-field px-5 text-body font-bold ' +
  'transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ' +
  'disabled:cursor-not-allowed disabled:opacity-60';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-white hover:bg-primary-hover disabled:hover:bg-primary',
  secondary:
    'border-[1.5px] border-primary bg-surface text-primary hover:bg-primary-soft hover:text-primary-hover disabled:hover:bg-surface',
  danger:
    'border-[1.5px] border-danger bg-surface text-danger hover:bg-status-atrasado-bg hover:text-danger-hover disabled:hover:bg-surface',
};

interface CommonProps {
  variant?: ButtonVariant;
  fullWidth?: boolean;
  className?: string;
  children: ReactNode;
}

export type ButtonAsButtonProps = CommonProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'children'> & {
    href?: undefined;
    /** Disables the button, sets aria-busy and announces "Cargando…". */
    loading?: boolean;
    ref?: Ref<HTMLButtonElement>;
  };

export type ButtonAsLinkProps = CommonProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'className' | 'children' | 'href'> & {
    /** Renders a next/link with the look of a button. */
    href: string;
    loading?: never;
    ref?: Ref<HTMLAnchorElement>;
  };

export type ButtonProps = ButtonAsButtonProps | ButtonAsLinkProps;

function Spinner() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-5 animate-spin motion-reduce:animate-none"
      fill="none"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Button(props: ButtonProps) {
  if (props.href !== undefined) {
    const { variant = 'primary', fullWidth, className, children, href, ...rest } = props;
    return (
      <Link
        href={href}
        className={cx(base, variants[variant], fullWidth && 'w-full', 'no-underline', className)}
        {...rest}
      >
        {children}
      </Link>
    );
  }

  const {
    variant = 'primary',
    fullWidth,
    className,
    children,
    loading = false,
    disabled,
    type = 'button',
    ...rest
  } = props;

  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(base, variants[variant], fullWidth && 'w-full', className)}
      {...rest}
    >
      {loading && <Spinner />}
      {children}
      {loading && <span className="sr-only">Cargando…</span>}
    </button>
  );
}
