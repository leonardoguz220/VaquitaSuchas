import { useId, type ReactNode } from 'react';

// Shared by Field and Select. min-h-12 = 48 px, text-body = 17 px (no iOS zoom).
// The invalid state also changes the border width, so it does not rely on color only.
export const controlClass =
  'block min-h-12 w-full rounded-field border-[1.5px] border-field-border bg-surface px-3.5 text-body text-ink ' +
  'focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ' +
  'disabled:cursor-not-allowed disabled:bg-bg disabled:text-muted ' +
  'aria-invalid:border-2 aria-invalid:border-danger';

/** Ids that link the label, the control, the hint and the error of a form field. */
export function useFieldIds(
  id: string | undefined,
  hasHint: boolean,
  hasError: boolean,
  describedBy?: string,
) {
  const generated = useId();
  const controlId = id ?? generated;
  const hintId = `${controlId}-hint`;
  const errorId = `${controlId}-error`;
  const describedByValue =
    [describedBy, hasHint && hintId, hasError && errorId].filter(Boolean).join(' ') || undefined;
  return { controlId, hintId, errorId, describedBy: describedByValue };
}

export function FieldLabel({ htmlFor, children }: { htmlFor: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="text-[15px] font-bold text-ink">
      {children}
    </label>
  );
}

export function FieldHint({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} className="text-[15px] text-muted">
      {children}
    </p>
  );
}

export function FieldError({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} role="alert" className="flex items-start gap-1.5 text-[15px] font-bold text-danger">
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        className="mt-0.5 size-4 shrink-0"
        fill="currentColor"
      >
        <path d="M10 1.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17Zm-.9 4.5h1.8v5.5H9.1V6Zm.9 9a1.1 1.1 0 1 1 0-2.2 1.1 1.1 0 0 1 0 2.2Z" />
      </svg>
      <span>{children}</span>
    </p>
  );
}
