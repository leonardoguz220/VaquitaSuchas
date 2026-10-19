'use client';

import { useEffect, useId, useMemo, useState, type ChangeEvent } from 'react';
import { Button } from '@/components/ui';
import { FieldError } from '@/components/ui/field-parts';
import { checkQrFile, QR_ACCEPTED_TYPES } from '@/lib/group-form';
import { GROUP_MESSAGES } from './group-messages';

/** URL local para la vista previa; se libera al cambiar de archivo o al desmontar. */
function usePreviewUrl(file: File | null): string | null {
  const url = useMemo(() => {
    if (!file || typeof URL.createObjectURL !== 'function') return null;
    return URL.createObjectURL(file);
  }, [file]);
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  return url;
}

export interface PaymentQrInputProps {
  file: File | null;
  onChange: (file: File | null) => void;
}

/**
 * QR de pago opcional (RF-001-20, plan 001 §6) con vista previa. Avisa en el cliente el tipo
 * (JPG o PNG) y el tamaño (2 MB) solo como ayuda: el servidor valida el tipo real.
 */
export function PaymentQrInput({ file, onChange }: PaymentQrInputProps) {
  const inputId = useId();
  const hintId = useId();
  const errorId = useId();
  const [problem, setProblem] = useState<string | null>(null);
  const previewUrl = usePreviewUrl(file);

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    // Se limpia para poder volver a elegir el mismo archivo.
    event.target.value = '';
    if (!selected) return;
    const check = checkQrFile(selected);
    if (check) {
      setProblem(check === 'type' ? GROUP_MESSAGES.qrType : GROUP_MESSAGES.qrSize);
      return;
    }
    setProblem(null);
    onChange(selected);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-4 rounded-field border-[1.5px] border-dashed border-field-border p-4">
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:)
          <img
            src={previewUrl}
            alt="Vista previa del QR de pago"
            className="size-24 rounded-field border border-line object-contain"
          />
        ) : (
          <span
            aria-hidden="true"
            className="inline-flex size-24 items-center justify-center rounded-field bg-bg text-[15px] text-muted"
          >
            QR
          </span>
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="font-bold">QR de pago (opcional)</span>
          <span id={hintId} className="text-[15px] text-muted">
            {file ? file.name : 'JPG o PNG, hasta 2 MB.'}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            id={inputId}
            type="file"
            accept={QR_ACCEPTED_TYPES.join(',')}
            onChange={handleChange}
            aria-describedby={problem ? `${hintId} ${errorId}` : hintId}
            aria-invalid={problem ? true : undefined}
            className="peer sr-only"
          />
          <label
            htmlFor={inputId}
            className="inline-flex min-h-12 cursor-pointer items-center justify-center rounded-field border-[1.5px] border-primary bg-surface px-5 font-bold text-primary hover:bg-primary-soft peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink"
          >
            {file ? 'Cambiar QR' : 'Subir QR'}
          </label>
          {file && (
            <Button variant="secondary" onClick={() => onChange(null)}>
              Quitar QR
            </Button>
          )}
        </div>
      </div>
      {problem && <FieldError id={errorId}>{problem}</FieldError>}
    </div>
  );
}
