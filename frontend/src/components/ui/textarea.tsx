import type { ReactNode, Ref, TextareaHTMLAttributes } from 'react';
import { cx } from './cx';
import { controlClass, FieldError, FieldHint, FieldLabel, useFieldIds } from './field-parts';

export interface TextareaProps extends Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  'children'
> {
  label: ReactNode;
  /** Help text, linked with aria-describedby. */
  hint?: ReactNode;
  /** Error message (for example, the one returned by the API). Sets aria-invalid. */
  error?: ReactNode;
  ref?: Ref<HTMLTextAreaElement>;
}

/** Multi-line text field with the same label, hint and error as `Field`. */
export function Textarea({
  label,
  hint,
  error,
  id,
  className,
  rows = 3,
  'aria-describedby': ariaDescribedBy,
  ...rest
}: TextareaProps) {
  const ids = useFieldIds(id, Boolean(hint), Boolean(error), ariaDescribedBy);

  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel htmlFor={ids.controlId}>{label}</FieldLabel>
      <textarea
        id={ids.controlId}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={ids.describedBy}
        className={cx(controlClass, 'py-3', className)}
        {...rest}
      />
      {hint && <FieldHint id={ids.hintId}>{hint}</FieldHint>}
      {error && <FieldError id={ids.errorId}>{error}</FieldError>}
    </div>
  );
}
