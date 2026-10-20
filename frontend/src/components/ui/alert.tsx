import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';

export type AlertVariant = 'info' | 'success' | 'warning' | 'error';

interface VariantStyle {
  className: string;
  icon: string;
  /** Hidden prefix so screen readers hear the kind of message, not only its color. */
  srLabel: string;
}

const styles: Record<AlertVariant, VariantStyle> = {
  info: {
    className: 'border-status-en-revision-fg bg-status-en-revision-bg text-status-en-revision-fg',
    icon: 'M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm0 3a1.1 1.1 0 1 1 0 2.2A1.1 1.1 0 0 1 10 5Zm.9 9.5H9.1V8.5h1.8v6Z',
    srLabel: 'Información:',
  },
  success: {
    className: 'border-status-pagado-fg bg-status-pagado-bg text-status-pagado-fg',
    icon: 'M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm3.8 5.3 1.3 1.3-6 6-3.4-3.4 1.3-1.3 2.1 2.1 4.7-4.7Z',
    srLabel: 'Listo:',
  },
  warning: {
    className: 'border-status-pendiente-fg bg-status-pendiente-bg text-status-pendiente-fg',
    icon: 'M10 1.8 19 18H1L10 1.8Zm-.9 5.7v5h1.8v-5H9.1Zm.9 8.3a1.1 1.1 0 1 0 0-2.2 1.1 1.1 0 0 0 0 2.2Z',
    srLabel: 'Atención:',
  },
  error: {
    className: 'border-status-atrasado-fg bg-status-atrasado-bg text-status-atrasado-fg',
    icon: 'M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm-.9 3.5h1.8v5.5H9.1V5.5Zm.9 9a1.1 1.1 0 1 1 0-2.2 1.1 1.1 0 0 1 0 2.2Z',
    srLabel: 'Error:',
  },
};

export interface AlertProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  variant?: AlertVariant;
  title?: ReactNode;
  /** Optional action, for example <Button>Reintentar</Button>. */
  action?: ReactNode;
  children?: ReactNode;
}

export function Alert({
  variant = 'info',
  title,
  action,
  children,
  className,
  ...rest
}: AlertProps) {
  const style = styles[variant];

  return (
    <div
      role={variant === 'error' ? 'alert' : 'status'}
      className={cx(
        'flex flex-col gap-3 rounded-field border-l-4 p-4 sm:flex-row sm:items-start',
        style.className,
        className,
      )}
      {...rest}
    >
      <div className="flex flex-1 items-start gap-3">
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          className="mt-0.5 size-5 shrink-0"
          fill="currentColor"
        >
          <path fillRule="evenodd" d={style.icon} />
        </svg>
        <div className="flex flex-col gap-1 text-body">
          <span className="sr-only">{style.srLabel}</span>
          {title && <p className="font-bold">{title}</p>}
          {children && <div>{children}</div>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
