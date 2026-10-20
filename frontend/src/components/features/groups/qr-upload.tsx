'use client';

import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react';
import { FieldError } from '@/components/ui/field-parts';
import { validateQrFile } from './new-group-form-model';

const ACTION =
  'inline-flex min-h-12 cursor-pointer items-center justify-center rounded-field border-[1.5px] ' +
  'border-primary bg-surface px-5 font-bold text-primary hover:bg-primary-soft ' +
  'focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ink';

function createPreview(file: File): string | null {
  return typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : null;
}

export interface QrUploadProps {
  file: File | null;
  onChange: (file: File | null) => void;
}

/**
 * QR de pago opcional (RF-001-20) con vista previa. El tipo y el tamaño se revisan aquí solo
 * como ayuda; el backend valida el tipo real (413 y 415).
 */
export function QrUpload({ file, onChange }: QrUploadProps) {
  const inputId = useId();
  const errorId = `${inputId}-error`;
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const previewRef = useRef<string | null>(null);

  useEffect(
    () => () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    },
    [],
  );

  function replacePreview(next: string | null) {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = next;
    setPreview(next);
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    event.target.value = '';
    if (!selected) return;
    const problem = validateQrFile(selected);
    setError(problem);
    if (problem) return;
    replacePreview(createPreview(selected));
    onChange(selected);
  }

  function remove() {
    replacePreview(null);
    setError(null);
    onChange(null);
  }

  return (
    <div className="flex flex-col gap-3 rounded-field border-[1.5px] border-dashed border-field-border p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {file && preview ? (
          // eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:)
          <img
            src={preview}
            alt="Vista previa del QR de pago"
            className="size-24 shrink-0 rounded-field border border-line object-contain"
          />
        ) : (
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="size-7 shrink-0 text-muted"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <rect x="3" y="3" width="7" height="7" rx="1.5" />
            <rect x="14" y="3" width="7" height="7" rx="1.5" />
            <rect x="3" y="14" width="7" height="7" rx="1.5" />
            <path d="M14 14h3v3h-3zM20 14v7h-6" />
          </svg>
        )}
        <div className="flex flex-1 flex-col">
          <span className="font-bold">QR de pago (opcional)</span>
          <span className="text-[15px] text-muted">
            {file ? file.name : 'JPG o PNG, hasta 2 MB.'}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <label htmlFor={inputId} className={ACTION}>
            {file ? 'Cambiar QR' : 'Subir QR'}
            <input
              id={inputId}
              type="file"
              accept="image/jpeg,image/png"
              aria-describedby={error ? errorId : undefined}
              aria-invalid={error ? true : undefined}
              onChange={handleChange}
              className="sr-only"
            />
          </label>
          {file && (
            <button type="button" onClick={remove} className={ACTION}>
              Quitar QR
            </button>
          )}
        </div>
      </div>
      {error && <FieldError id={errorId}>{error}</FieldError>}
    </div>
  );
}
