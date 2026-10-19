import type { ReactNode, Ref, SelectHTMLAttributes } from 'react';
import { cx } from './cx';
import { controlClass, FieldError, FieldHint, FieldLabel, useFieldIds } from './field-parts';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  /** Optional first option with an empty value, for example "Elige un servicio". */
  placeholder?: string;
  ref?: Ref<HTMLSelectElement>;
}

export function Select({
  label,
  hint,
  error,
  placeholder,
  id,
  className,
  children,
  'aria-describedby': ariaDescribedBy,
  ...rest
}: SelectProps) {
  const ids = useFieldIds(id, Boolean(hint), Boolean(error), ariaDescribedBy);

  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel htmlFor={ids.controlId}>{label}</FieldLabel>
      <div className="relative">
        <select
          id={ids.controlId}
          aria-invalid={error ? true : undefined}
          aria-describedby={ids.describedBy}
          className={cx(controlClass, 'appearance-none pr-11', className)}
          {...rest}
        >
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {children}
        </select>
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          className="pointer-events-none absolute top-1/2 right-3.5 size-5 -translate-y-1/2 text-muted"
          fill="currentColor"
        >
          <path d="M5.3 7.3a1 1 0 0 1 1.4 0L10 10.6l3.3-3.3a1 1 0 1 1 1.4 1.4l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 0 1 0-1.4Z" />
        </svg>
      </div>
      {hint && <FieldHint id={ids.hintId}>{hint}</FieldHint>}
      {error && <FieldError id={ids.errorId}>{error}</FieldError>}
    </div>
  );
}
