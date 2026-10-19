'use client';

import { useEffect, useId, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { Alert, Button, Card, Field } from '@/components/ui';
import { cx } from '@/components/ui/cx';
import { FieldError } from '@/components/ui/field-parts';
import { useUploadReceipt } from '@/hooks/use-charges';
import {
  checkReceiptFile,
  formatFileSize,
  RECEIPT_ACCEPTED_TYPES,
  RECEIPT_REFERENCE_MAX,
  receiptFileType,
} from '@/lib/receipt-file';
import type { Charge, PaymentMethod } from '@/services/charges';
import { CHARGE_MESSAGES, PAYMENT_METHOD_LABEL, uploadErrorOutcome } from './charge-messages';

const METHODS: PaymentMethod[] = ['transferencia', 'qr'];

/** URL local para la vista previa de una imagen; se libera al cambiar de archivo o al desmontar. */
function useImagePreview(file: File | null): string | null {
  const url = useMemo(() => {
    if (!file || !receiptFileType(file).startsWith('image/')) return null;
    if (typeof URL.createObjectURL !== 'function') return null;
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

function FilePreview({ file, previewUrl }: { file: File | null; previewUrl: string | null }) {
  if (previewUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:)
      <img
        src={previewUrl}
        alt="Vista previa del comprobante"
        className="size-24 rounded-field border border-line object-contain"
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="inline-flex size-24 shrink-0 items-center justify-center rounded-field bg-bg font-bold text-muted"
    >
      {file ? 'PDF' : 'JPG · PDF'}
    </span>
  );
}

export interface ReceiptUploadProps {
  charge: Charge;
  /** Respuesta de la API: el cobro ya en `en_revision`. */
  onUploaded: (charge: Charge) => void;
  /** El cobro cambió en el servidor: se vuelve a pedir y se avisa. */
  onStale: (message: string) => void;
}

/**
 * Subir o reemplazar el comprobante en `/cobros/[id]` (spec 002 T022, plan §6; mockup
 * `Cobro.dc.html`) en 3 toques (RNF-002-06): (1) **Subir comprobante** abre la cámara o la
 * galería; (2) método y referencia obligatoria; (3) **Enviar al titular**. Vista previa,
 * JPG/PNG/PDF y 5 MB avisados en el cliente solo como ayuda: el servidor valida el tipo real
 * (RNF-002-02). Si algo falla, se conservan el archivo y los campos para reintentar.
 */
export function ReceiptUpload({ charge, onUploaded, onStale }: ReceiptUploadProps) {
  const titleId = useId();
  const inputId = useId();
  const fileInfoId = useId();
  const fileErrorId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [method, setMethod] = useState<PaymentMethod>('transferencia');
  const [reference, setReference] = useState('');
  const [fileError, setFileError] = useState<string | null>(null);
  const [referenceError, setReferenceError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const previewUrl = useImagePreview(file);
  const { submit, isSubmitting } = useUploadReceipt(charge.id);
  const replacing = charge.status === 'en_revision';

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    // Se limpia para poder volver a elegir el mismo archivo.
    event.target.value = '';
    if (!selected) return;
    const check = checkReceiptFile(selected);
    if (check) {
      setFileError(check === 'type' ? CHARGE_MESSAGES.receiptType : CHARGE_MESSAGES.receiptSize);
      return;
    }
    setFileError(null);
    setFormError(null);
    setFile(selected);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return;
    const trimmed = reference.trim();
    if (!trimmed) {
      setReferenceError(CHARGE_MESSAGES.referenceRequired);
      return;
    }
    setReferenceError(null);
    setFormError(null);
    const result = await submit({ file, method, reference: trimmed, version: charge.version });
    if (!result) return;
    if (result.ok) {
      setFile(null);
      setReference('');
      setMethod('transferencia');
      onUploaded(result.data);
      return;
    }
    const outcome = uploadErrorOutcome(result.error);
    if (outcome.refresh) {
      onStale(outcome.message);
      return;
    }
    if (outcome.field === 'file') setFileError(outcome.message);
    else if (outcome.field === 'reference') setReferenceError(outcome.message);
    else setFormError(outcome.message);
  }

  return (
    <Card as="section" aria-labelledby={titleId} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id={titleId} className="font-display text-xl font-bold">
          {replacing ? 'Reemplazar comprobante' : 'Sube tu comprobante'}
        </h2>
        <p className="text-[15px] text-muted">
          {replacing
            ? 'Mientras el titular no lo revise puedes cambiarlo. El anterior queda en el historial del cobro.'
            : 'Una foto o captura del pago, o el PDF que te dio tu banco.'}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-4 rounded-field border-[1.5px] border-dashed border-field-border p-4">
          <FilePreview file={file} previewUrl={previewUrl} />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span id={fileInfoId} className="font-bold break-all">
              {file ? file.name : 'Ningún archivo elegido'}
            </span>
            <span className="text-[15px] text-muted">
              {file ? `${formatFileSize(file.size)} · ` : ''}JPG, PNG o PDF hasta 5 MB
            </span>
          </div>
          <input
            id={inputId}
            type="file"
            accept={RECEIPT_ACCEPTED_TYPES.join(',')}
            onChange={handleFile}
            aria-describedby={fileError ? `${fileInfoId} ${fileErrorId}` : fileInfoId}
            aria-invalid={fileError ? true : undefined}
            className="peer sr-only"
          />
          <label
            htmlFor={inputId}
            className="inline-flex min-h-12 w-full cursor-pointer items-center justify-center rounded-field border-[1.5px] border-primary bg-surface px-5 font-bold text-primary hover:bg-primary-soft peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink sm:w-auto"
          >
            {file ? 'Cambiar archivo' : 'Subir comprobante'}
          </label>
        </div>
        {fileError && <FieldError id={fileErrorId}>{fileError}</FieldError>}
      </div>

      {file && (
        <form
          noValidate
          onSubmit={(event) => void handleSubmit(event)}
          className="flex flex-col gap-4"
        >
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1.5 font-bold">Método</legend>
            <div className="flex flex-wrap gap-2">
              {METHODS.map((value) => (
                <label
                  key={value}
                  className={cx(
                    'inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border-[1.5px] px-4',
                    'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary',
                    method === value
                      ? 'border-ink bg-ink font-bold text-white'
                      : 'border-field-border bg-surface text-ink',
                  )}
                >
                  <input
                    type="radio"
                    name="method"
                    value={value}
                    checked={method === value}
                    onChange={() => setMethod(value)}
                    className="size-4 accent-primary"
                  />
                  {PAYMENT_METHOD_LABEL[value]}
                </label>
              ))}
            </div>
          </fieldset>
          <Field
            label="Referencia (obligatoria)"
            hint="El número que aparece en tu comprobante."
            value={reference}
            maxLength={RECEIPT_REFERENCE_MAX}
            autoComplete="off"
            required
            error={referenceError}
            onChange={(event) => setReference(event.target.value)}
          />
          {formError && <Alert variant="error">{formError}</Alert>}
          <Button type="submit" loading={isSubmitting} className="w-full sm:w-auto sm:self-start">
            Enviar al titular
          </Button>
        </form>
      )}
    </Card>
  );
}
