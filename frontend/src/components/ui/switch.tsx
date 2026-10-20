import type { InputHTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';

export interface SwitchProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'children' | 'checked'
> {
  /** Visible text next to the switch. Use `aria-label` when several share the same text. */
  label: ReactNode;
  checked: boolean;
  /** Visible state text, so the state does not rely on color or position only. */
  onText?: string;
  offText?: string;
}

/**
 * On/off switch: a native checkbox with `role="switch"` (keyboard and screen readers for free),
 * a 44 px touch target and the state written as text ("Activado" / "Desactivado").
 */
export function Switch({
  label,
  checked,
  onText = 'Activado',
  offText = 'Desactivado',
  disabled,
  className,
  ...rest
}: SwitchProps) {
  return (
    <label
      className={cx(
        'inline-flex min-h-11 items-center gap-3',
        disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
        className,
      )}
    >
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        className="peer sr-only"
        {...rest}
      />
      <span
        aria-hidden="true"
        className={cx(
          'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border-[1.5px] border-field-border bg-bg transition-colors',
          'peer-checked:border-primary peer-checked:bg-primary',
          'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary',
          'peer-checked:[&>span]:translate-x-5',
        )}
      >
        <span className="ml-0.5 size-5 rounded-full bg-surface shadow transition-transform motion-reduce:transition-none" />
      </span>
      <span className="text-ink">{label}</span>
      <span aria-hidden="true" className="text-[15px] text-muted">
        {checked ? onText : offText}
      </span>
    </label>
  );
}
