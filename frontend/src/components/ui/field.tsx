import type { InputHTMLAttributes, ReactNode, Ref } from 'react';
import { cx } from './cx';
import { controlClass, FieldError, FieldHint, FieldLabel, useFieldIds } from './field-parts';

export interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'children'> {
  label: ReactNode;
  /** Help text, linked with aria-describedby. */
  hint?: ReactNode;
  /** Error message (for example, the one returned by the API). Sets aria-invalid. */
  error?: ReactNode;
  ref?: Ref<HTMLInputElement>;
}

export function Field({
  label,
  hint,
  error,
  id,
  className,
  type = 'text',
  'aria-describedby': ariaDescribedBy,
  ...rest
}: FieldProps) {
  const ids = useFieldIds(id, Boolean(hint), Boolean(error), ariaDescribedBy);

  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel htmlFor={ids.controlId}>{label}</FieldLabel>
      <input
        id={ids.controlId}
        type={type}
        aria-invalid={error ? true : undefined}
        aria-describedby={ids.describedBy}
        className={cx(controlClass, className)}
        {...rest}
      />
      {hint && <FieldHint id={ids.hintId}>{hint}</FieldHint>}
      {error && <FieldError id={ids.errorId}>{error}</FieldError>}
    </div>
  );
}
