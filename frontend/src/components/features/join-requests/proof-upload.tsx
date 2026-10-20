'use client';

import { useId, useState, type ChangeEvent, type FormEvent } from 'react';
import { Alert, Button, Card, Field } from '@/components/ui';
import { cx } from '@/components/ui/cx';
import { FieldError } from '@/components/ui/field-parts';
import { useUploadJoinProof } from '@/hooks/use-join-requests';
import {
  checkReceiptFile,
  formatFileSize,
  RECEIPT_ACCEPTED_TYPES,
  RECEIPT_REFERENCE_MAX,
} from '@/lib/receipt-file';
import type { JoinPaymentMethod, JoinRequest } from '@/services/join-requests';
import { proofErrorOutcome } from './join-messages';
import { FilePreview, PAYMENT_METHOD_LABEL, PROOF_MESSAGES, useImagePreview } from './join-shared';

const METHODS: JoinPaymentMethod[] = ['qr', 'transferencia'];

/** Ancla de la sección, para el botón de la barra de acciones del celular. */
export const PROOF_SECTION_ID = 'comprobante';

export interface ProofUploadProps {
  request: JoinRequest;
  /** Respuesta de la API: la solicitud ya en `pago_informado`. */
  onUploaded: (request: JoinRequest) => void;
  /** La solicitud cambió en el servidor (por ejemplo, venció el plazo): se vuelve a pedir. */
  onStale: (message: string) => void;
}

/**
 * Subida del comprobante de ingreso en `/solicitudes/[id]` (spec 010 T026, RF-010-13; mockup
 * `Solicitud.dc.html`): archivo JPG, PNG o PDF hasta 5 MB con vista previa, método y referencia
 * obligatoria. El tipo y el tamaño se avisan en el cliente solo como ayuda: el servidor valida
 * el tipo real (CA-010-08). Si algo falla se conservan el archivo y los campos para reintentar.
 */
export function ProofUpload({ request, onUploaded, onStale }: ProofUploadProps) {
  const titleId = useId();
  const inputId = useId();
  const fileInfoId = useId();
  const fileErrorId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [method, setMethod] = useState<JoinPaymentMethod>('qr');
  const [reference, setReference] = useState('');
  const [fileError, setFileError] = useState<string | null>(null);
  const [referenceError, setReferenceError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const previewUrl = useImagePreview(file);
  const { submit, isSubmitting } = useUploadJoinProof(request.id);

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    // Se limpia para poder volver a elegir el mismo archivo.
    event.target.value = '';
    if (!selected) return;
    const check = checkReceiptFile(selected);
    if (check) {
      setFileError(check === 'type' ? PROOF_MESSAGES.receiptType : PROOF_MESSAGES.receiptSize);
      return;
    }
    setFileError(null);
    setFormError(null);
    setFile(selected);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = reference.trim();
    if (!file) {
      setFileError(PROOF_MESSAGES.receiptType);
      return;
    }
    if (!trimmed) {
      setReferenceError(PROOF_MESSAGES.referenceRequired);
      return;
    }
    setReferenceError(null);
    setFormError(null);
    const result = await submit({ file, method, reference: trimmed, version: request.version });
    if (!result) return;
    if (result.ok) {
      setFile(null);
      setReference('');
      onUploaded(result.data);
      return;
    }
    const outcome = proofErrorOutcome(result.error);
    if (outcome.refresh) {
      onStale(outcome.message);
      return;
    }
    if (outcome.field === 'file') setFileError(outcome.message);
    else if (outcome.field === 'reference') setReferenceError(outcome.message);
    else setFormError(outcome.message);
  }

  return (
    <Card
      as="section"
      id={PROOF_SECTION_ID}
      aria-labelledby={titleId}
      className="flex scroll-mt-4 flex-col gap-4"
    >
      <div className="flex flex-col gap-1">
        <h2 id={titleId} className="font-display text-xl font-bold">
          Sube tu comprobante
        </h2>
        <p className="text-[15px] text-muted">
          Una foto o captura del pago, o el PDF de tu banco, con la referencia de la transacción.
        </p>
      </div>

      <form
        noValidate
        onSubmit={(event) => void handleSubmit(event)}
        className="flex flex-col gap-4"
      >
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
              {file ? 'Cambiar archivo' : 'Elegir archivo'}
            </label>
          </div>
          {fileError && <FieldError id={fileErrorId}>{fileError}</FieldError>}
        </div>

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
                  name="join-proof-method"
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
          Enviar comprobante
        </Button>
      </form>
    </Card>
  );
}
