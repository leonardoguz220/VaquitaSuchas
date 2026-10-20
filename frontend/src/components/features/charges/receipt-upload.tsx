'use client';

import { useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Alert, Button, Field, Select } from '@/components/ui';
import { FieldError } from '@/components/ui/field-parts';
import { useReceiptUpload } from '@/hooks/use-receipt-upload';
import type { Charge, ReceiptMethod } from '@/services/charges';
import type { ChargeActionsContext } from './charge-detail';
import {
  RECEIPT_ACCEPT,
  RECEIPT_MESSAGES,
  REFERENCE_MAX_LENGTH,
  receiptUploadError,
  validateReceiptFile,
  validateReference,
  type ReceiptUploadError,
} from './receipt-upload-model';

const FILE_ACTION =
  'inline-flex min-h-12 cursor-pointer items-center justify-center rounded-field border-[1.5px] ' +
  'border-primary bg-surface px-5 font-bold text-primary hover:bg-primary-soft ' +
  'focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ink';

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'JPG',
  'image/png': 'PNG',
  'application/pdf': 'PDF',
};

/** Solo las imágenes tienen vista previa; el PDF se muestra con su nombre. */
function createPreview(file: File): string | null {
  if (!file.type.startsWith('image/')) return null;
  return typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : null;
}

function formatSize(bytes: number): string {
  if (bytes >= 100 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

type FormAlert = Extract<ReceiptUploadError, { target: 'form' }>;

export interface ReceiptUploadProps extends ChargeActionsContext {
  charge: Charge;
}

/**
 * Subida del comprobante en 3 toques (RF-002-06/07, plan 002 §6): elegir archivo, completar
 * método y referencia, y «Enviar». Se monta solo si `allowedActions` incluye `uploadReceipt`;
 * en `en_revision` reemplaza el vigente (RF-002-08). Tipo y tamaño se revisan aquí solo como
 * ayuda: el backend responde 413 y 415.
 */
export function ReceiptUpload({ charge, onChargeChange }: ReceiptUploadProps) {
  const inputId = useId();
  const fileHintId = `${inputId}-hint`;
  const fileErrorId = `${inputId}-error`;
  const { submit, isSubmitting } = useReceiptUpload({ charge, onChargeChange });

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const previewRef = useRef<string | null>(null);
  const [method, setMethod] = useState<ReceiptMethod>(
    charge.paymentInfo?.qrUrl ? 'qr' : 'transferencia',
  );
  const [reference, setReference] = useState('');
  const [fileError, setFileError] = useState<string | null>(null);
  const [referenceError, setReferenceError] = useState<string | null>(null);
  const [formAlert, setFormAlert] = useState<FormAlert | null>(null);
  const [sent, setSent] = useState(false);
  const referenceRef = useRef<HTMLInputElement>(null);

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

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    event.target.value = '';
    if (!selected) return;
    setSent(false);
    setFormAlert(null);
    const problem = validateReceiptFile(selected);
    setFileError(problem);
    if (problem) return;
    setFile(selected);
    replacePreview(createPreview(selected));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSent(false);
    setFormAlert(null);
    const nextFileError = file ? null : RECEIPT_MESSAGES.fileMissing;
    const nextReferenceError = validateReference(reference);
    setFileError(nextFileError);
    setReferenceError(nextReferenceError);
    if (nextReferenceError) referenceRef.current?.focus();
    if (!file || nextReferenceError) return;

    const result = await submit({ file, method, reference: reference.trim() });
    if (!result) return;
    if (result.ok) {
      setFile(null);
      replacePreview(null);
      setReference('');
      setSent(true);
      return;
    }
    const mapped = receiptUploadError(result.error);
    if (mapped.target === 'form') {
      setFormAlert(mapped);
    } else if (mapped.target === 'reference') {
      setReferenceError(mapped.message);
      referenceRef.current?.focus();
    } else {
      setFileError(mapped.message);
    }
  }

  const replacing = charge.status === 'en_revision';
  let pickLabel = replacing ? 'Reemplazar comprobante' : 'Subir comprobante';
  if (file) pickLabel = 'Cambiar archivo';

  return (
    <form
      noValidate
      aria-labelledby="receipt-upload-title"
      onSubmit={handleSubmit}
      className="flex flex-col gap-5 rounded-card border border-line bg-surface p-5 sm:p-6"
    >
      <h2 id="receipt-upload-title" className="font-display text-xl font-bold">
        {replacing ? 'Reemplaza tu comprobante' : 'Sube tu comprobante'}
      </h2>

      {sent && <Alert variant="success" title={RECEIPT_MESSAGES.success} />}
      {formAlert && (
        <Alert variant={formAlert.variant} title={formAlert.title}>
          {formAlert.detail}
        </Alert>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-4 rounded-field bg-bg p-4">
          {file && preview ? (
            // eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:)
            <img
              src={preview}
              alt="Vista previa del comprobante"
              className="h-18 w-14 shrink-0 rounded-lg border border-line object-cover"
            />
          ) : (
            <div
              aria-hidden="true"
              className="flex h-18 w-14 shrink-0 items-center justify-center rounded-lg bg-line text-xs font-bold text-muted"
            >
              {file ? (EXTENSIONS[file.type] ?? 'Archivo') : 'Archivo'}
            </div>
          )}
          <div className="flex min-w-40 flex-1 flex-col gap-0.5">
            <span className="font-bold break-all">
              {file ? file.name : 'Foto o PDF de tu comprobante'}
            </span>
            <span id={fileHintId} className="text-[15px] text-muted">
              {file ? `${formatSize(file.size)} · ` : ''}JPG, PNG o PDF hasta 5 MB
            </span>
          </div>
          <label htmlFor={inputId} className={FILE_ACTION}>
            {pickLabel}
            <input
              id={inputId}
              type="file"
              accept={RECEIPT_ACCEPT}
              aria-describedby={fileError ? `${fileHintId} ${fileErrorId}` : fileHintId}
              aria-invalid={fileError ? true : undefined}
              onChange={handleFile}
              disabled={isSubmitting}
              className="sr-only"
            />
          </label>
        </div>
        {fileError && <FieldError id={fileErrorId}>{fileError}</FieldError>}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          label="Método"
          value={method}
          onChange={(event) => setMethod(event.target.value as ReceiptMethod)}
          disabled={isSubmitting}
        >
          <option value="qr">QR</option>
          <option value="transferencia">Transferencia</option>
        </Select>
        <Field
          ref={referenceRef}
          label="Referencia (obligatoria)"
          hint="El número que aparece en tu comprobante."
          value={reference}
          maxLength={REFERENCE_MAX_LENGTH}
          required
          autoComplete="off"
          error={referenceError}
          disabled={isSubmitting}
          onChange={(event) => {
            setReference(event.target.value);
            if (referenceError) setReferenceError(null);
          }}
        />
      </div>

      <div className="flex sm:justify-end">
        <Button type="submit" loading={isSubmitting} className="w-full sm:w-auto">
          Enviar
        </Button>
      </div>
    </form>
  );
}
