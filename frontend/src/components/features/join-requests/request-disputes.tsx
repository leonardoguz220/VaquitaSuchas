'use client';

import { useId, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import { useImagePreview } from './join-shared';
import { Alert, Badge, Button, Card, Textarea } from '@/components/ui';
import { FieldError } from '@/components/ui/field-parts';
import { useDisputes, useOpenDispute, useRespondDispute } from '@/hooks/use-join-requests';
import { formatDateLaPaz, formatDateTimeLaPaz } from '@/lib/dates';
import { CHAT_IMAGE_TYPES, checkChatImage } from '@/lib/receipt-file';
import type { ApiError } from '@/services/http';
import type { Dispute, JoinRequest } from '@/services/join-requests';
import {
  DISPUTE_KIND_LABEL,
  DISPUTE_MESSAGES,
  DISPUTE_NEXT_STEPS,
  DISPUTE_RESULT_LABEL,
  disputeErrorOutcome,
  joinErrorMessage,
} from './join-messages';

const TEXT_MIN = 10;
const TEXT_MAX = 500;

interface TextWithEvidenceFormProps {
  label: string;
  hint: string;
  lengthMessage: string;
  submitLabel: string;
  isSubmitting: boolean;
  /** Devuelve el error de la API o `null` si salió bien (o se recargó). */
  onSubmit: (text: string, evidence: File | null) => Promise<ApiError | null>;
  /** Contenido entre los campos y el botón (avisos fijos). */
  children?: ReactNode;
}

/**
 * Texto de 10 a 500 caracteres con una imagen de evidencia opcional (JPG o PNG hasta 5 MB). El
 * tipo y el tamaño se avisan en el cliente como ayuda; el servidor los valida (CA-010-46).
 */
function TextWithEvidenceForm({
  label,
  hint,
  lengthMessage,
  submitLabel,
  isSubmitting,
  onSubmit,
  children,
}: TextWithEvidenceFormProps) {
  const inputId = useId();
  const errorId = useId();
  const textRef = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState('');
  const [evidence, setEvidence] = useState<File | null>(null);
  const [textError, setTextError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const previewUrl = useImagePreview(evidence);

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    event.target.value = '';
    if (!selected) return;
    const check = checkChatImage(selected);
    if (check) {
      setFileError(
        check === 'type' ? DISPUTE_MESSAGES.evidenceType : DISPUTE_MESSAGES.evidenceSize,
      );
      return;
    }
    setFileError(null);
    setEvidence(selected);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = text.trim();
    if (trimmed.length < TEXT_MIN || trimmed.length > TEXT_MAX) {
      setTextError(lengthMessage);
      textRef.current?.focus();
      return;
    }
    setTextError(null);
    setFormError(null);
    const error = await onSubmit(trimmed, evidence);
    if (!error) return;
    const outcome = disputeErrorOutcome(error);
    if (outcome.field === 'file') setFileError(outcome.message);
    else if (outcome.field === 'text') setTextError(lengthMessage);
    else setFormError(outcome.message);
  }

  return (
    <form noValidate onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-4">
      <Textarea
        ref={textRef}
        label={label}
        hint={`${hint} ${text.trim().length} / ${TEXT_MAX}`}
        value={text}
        rows={4}
        maxLength={TEXT_MAX}
        required
        error={textError}
        onChange={(event) => setText(event.target.value)}
      />
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          {previewUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:)
            <img
              src={previewUrl}
              alt="Vista previa de la evidencia"
              className="size-16 rounded-field border border-line object-cover"
            />
          )}
          <span className="min-w-0 flex-1 text-[15px]">
            {evidence ? evidence.name : 'Evidencia (opcional): JPG o PNG hasta 5 MB'}
          </span>
          <input
            id={inputId}
            type="file"
            accept={CHAT_IMAGE_TYPES.join(',')}
            onChange={handleFile}
            aria-describedby={fileError ? errorId : undefined}
            aria-invalid={fileError ? true : undefined}
            className="peer sr-only"
          />
          <label
            htmlFor={inputId}
            className="inline-flex min-h-12 cursor-pointer items-center justify-center rounded-field border-[1.5px] border-primary bg-surface px-5 font-bold text-primary hover:bg-primary-soft peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink"
          >
            {evidence ? 'Cambiar imagen' : 'Adjuntar imagen'}
          </label>
          {evidence && (
            <Button variant="secondary" onClick={() => setEvidence(null)}>
              Quitar imagen
            </Button>
          )}
        </div>
        {fileError && <FieldError id={errorId}>{fileError}</FieldError>}
      </div>
      {children}
      {formError && <Alert variant="error">{formError}</Alert>}
      <Button type="submit" loading={isSubmitting} className="w-full sm:w-auto sm:self-start">
        {submitLabel}
      </Button>
    </form>
  );
}

interface CallbackProps {
  request: JoinRequest;
  /** La solicitud o sus reclamos cambiaron: se vuelven a pedir y se avisa. */
  onChanged: (message: string, variant: 'success' | 'warning') => void;
}

/** «Abrir reclamo» si la API lo permite (`canOpenDispute`, RF-010-21). */
function OpenDispute({ request, onChanged }: CallbackProps) {
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const { submit, isSubmitting } = useOpenDispute(request.id);
  const eligibility = request.canOpenDispute;
  if (!eligibility) return null;

  async function handleSubmit(description: string, evidence: File | null) {
    const result = await submit({ description, ...(evidence ? { evidence } : {}) });
    if (!result) return null;
    if (result.ok) {
      setOpen(false);
      onChanged(DISPUTE_MESSAGES.opened, 'success');
      return null;
    }
    const outcome = disputeErrorOutcome(result.error);
    if (outcome.refresh) {
      setOpen(false);
      onChanged(outcome.message, 'warning');
      return null;
    }
    return result.error;
  }

  return (
    <Card as="section" aria-labelledby={titleId} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id={titleId} className="font-display text-xl font-bold">
          Abrir un reclamo: {DISPUTE_KIND_LABEL[eligibility.kind]?.toLowerCase()}
        </h2>
        <p className="text-[15px] text-muted">
          Puedes abrirlo hasta el {formatDateTimeLaPaz(eligibility.closesAt)}.
        </p>
      </div>
      {open ? (
        <TextWithEvidenceForm
          label="Cuenta qué pasó (de 10 a 500 caracteres)"
          hint="Incluye montos, fechas y la referencia si la tienes."
          lengthMessage={DISPUTE_MESSAGES.descriptionLength}
          submitLabel="Abrir reclamo"
          isSubmitting={isSubmitting}
          onSubmit={handleSubmit}
        >
          <p className="rounded-field bg-bg p-3 text-[15px]">{DISPUTE_MESSAGES.noRefund}</p>
          <div className="flex flex-col gap-2">
            <h3 className="font-bold">Qué pasa después</h3>
            <ol className="flex list-decimal flex-col gap-1 pl-5 text-[15px]">
              {DISPUTE_NEXT_STEPS.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>
        </TextWithEvidenceForm>
      ) : (
        <Button variant="secondary" onClick={() => setOpen(true)} className="sm:self-start">
          Abrir reclamo
        </Button>
      )}
    </Card>
  );
}

function RespondForm({ request, dispute, onChanged }: CallbackProps & { dispute: Dispute }) {
  const { submit, isSubmitting } = useRespondDispute(request.id);

  async function handleSubmit(text: string, evidence: File | null) {
    const result = await submit({ disputeId: dispute.id, text, ...(evidence ? { evidence } : {}) });
    if (!result) return null;
    if (result.ok) {
      onChanged(DISPUTE_MESSAGES.responded, 'success');
      return null;
    }
    const outcome = disputeErrorOutcome(result.error);
    if (outcome.refresh) {
      onChanged(outcome.message, 'warning');
      return null;
    }
    return result.error;
  }

  return (
    <TextWithEvidenceForm
      label="Tu respuesta (de 10 a 500 caracteres)"
      hint="Solo puedes responder una vez."
      lengthMessage={DISPUTE_MESSAGES.responseLength}
      submitLabel="Enviar respuesta"
      isSubmitting={isSubmitting}
      onSubmit={handleSubmit}
    />
  );
}

function DisputeCard({
  request,
  dispute,
  canRespond,
  onChanged,
}: CallbackProps & { dispute: Dispute; canRespond: boolean }) {
  const titleId = useId();
  const resolved = dispute.status === 'resuelto';
  return (
    <Card as="article" aria-labelledby={titleId} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 id={titleId} className="font-display text-lg font-bold">
          Reclamo: {DISPUTE_KIND_LABEL[dispute.kind] ?? dispute.kind}
        </h3>
        <Badge variant={resolved ? 'success' : 'info'}>{resolved ? 'Resuelto' : 'Abierto'}</Badge>
      </div>
      <p className="text-[15px] text-muted">
        Abierto por {dispute.openedBy.fullName} el {formatDateLaPaz(dispute.openedAt)}
        {dispute.evidenceAvailable ? ' · con imagen de evidencia' : ''}
      </p>
      <p className="break-words whitespace-pre-line">{dispute.description}</p>
      {dispute.response ? (
        <div className="flex flex-col gap-1 border-l-2 border-line pl-4">
          <span className="font-bold">
            Respuesta · {formatDateLaPaz(dispute.response.respondedAt)}
          </span>
          <p className="break-words whitespace-pre-line">{dispute.response.text}</p>
          {dispute.response.evidenceAvailable && (
            <span className="text-[15px] text-muted">Con imagen de evidencia.</span>
          )}
        </div>
      ) : (
        canRespond && <RespondForm request={request} dispute={dispute} onChanged={onChanged} />
      )}
      {dispute.resolution ? (
        <Alert
          variant={dispute.resolution.result === 'estafa_confirmada' ? 'warning' : 'info'}
          title={`Decisión: ${DISPUTE_RESULT_LABEL[dispute.resolution.result] ?? dispute.resolution.result}`}
        >
          <p className="break-words">Motivo: {dispute.resolution.reason}</p>
          <p className="text-[15px]">{formatDateTimeLaPaz(dispute.resolution.resolvedAt)}</p>
        </Alert>
      ) : (
        <p className="text-[15px] text-muted">Un administrador revisará la evidencia.</p>
      )}
    </Card>
  );
}

function DisputeList({ request, onChanged }: CallbackProps) {
  const revision = request.disputes
    .map((ref) => `${ref.id}:${ref.status}:${ref.canRespond}`)
    .join('|');
  const { status, data, error, reload } = useDisputes(request.id, true, revision);

  if (status === 'loading' || status === 'redirecting') {
    return (
      <div
        role="status"
        aria-busy="true"
        className="h-32 animate-pulse rounded-card bg-line motion-reduce:animate-none"
      >
        <span className="sr-only">Cargando los reclamos…</span>
      </div>
    );
  }
  if (status === 'error' || !data) {
    return (
      <Alert
        variant="error"
        title={DISPUTE_MESSAGES.loadFailed}
        action={
          <Button variant="secondary" onClick={reload}>
            Reintentar
          </Button>
        }
      >
        {error ? joinErrorMessage(error) : null}
      </Alert>
    );
  }
  const respondable = new Set(
    request.disputes.filter((ref) => ref.canRespond).map((ref) => ref.id),
  );
  return (
    <>
      {data.items.map((dispute) => (
        <DisputeCard
          key={dispute.id}
          request={request}
          dispute={dispute}
          canRespond={respondable.has(dispute.id)}
          onChanged={onChanged}
        />
      ))}
    </>
  );
}

export interface RequestDisputesProps {
  request: JoinRequest;
  /** Se abrió o respondió un reclamo: se vuelve a pedir la solicitud y se avisa. */
  onChanged: (message: string, variant: 'success' | 'warning') => void;
}

/**
 * Reclamos en `/solicitudes/[id]` (spec 010 T039, RF-010-21 y RF-010-22; mockup
 * `Reclamo.dc.html`): **Abrir reclamo** si la API lo permite (`canOpenDispute`), con descripción
 * e imagen de evidencia; la respuesta de la otra parte (una sola, si `canRespond`) y la decisión
 * del administrador, visible para ambas partes (RF-010-24). El frontend no decide quién puede
 * reclamar ni hasta cuándo: lo dice la API.
 */
export function RequestDisputes({ request, onChanged }: RequestDisputesProps) {
  const titleId = useId();
  if (!request.canOpenDispute && request.disputes.length === 0) return null;
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-4">
      <h2 id={titleId} className="sr-only">
        Reclamos
      </h2>
      <OpenDispute request={request} onChanged={onChanged} />
      {request.disputes.length > 0 && <DisputeList request={request} onChanged={onChanged} />}
    </section>
  );
}
