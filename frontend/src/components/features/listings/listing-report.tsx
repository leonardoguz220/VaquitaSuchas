'use client';

import { useId, useRef, useState, type FormEvent } from 'react';
import { Alert, Button, Modal, Textarea } from '@/components/ui';
import { useReportListing } from '@/hooks/use-listings';
import { LISTING_TEXT_MAX, type ListingReportReason } from '@/services/listings';
import { REPORT_REASONS, reportErrorOutcome } from './listing-messages';

/**
 * **Reportar esta publicación** en `/cupos/[id]` (spec 008 T023, plan §6; mockup `Cupo.dc.html`):
 * modal con el motivo (spam, datos falsos, conducta indebida u otro) y un comentario opcional de
 * hasta 300 caracteres. Con tres reportes de personas distintas la API la oculta (RF-008-18);
 * cada persona reporta una vez (`409 ALREADY_REPORTED`, CA-008-18).
 */
export function ListingReport({ listingId }: { listingId: string }) {
  const formId = useId();
  const firstReasonRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ListingReportReason | null>(null);
  const [comment, setComment] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [result, setResult] = useState<{ message: string; ok: boolean } | null>(null);
  const { submit, isSubmitting } = useReportListing(listingId);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reason) {
      setReasonError('Elige un motivo.');
      firstReasonRef.current?.focus();
      return;
    }
    setReasonError(null);
    setFormError(null);
    const trimmed = comment.trim();
    const response = await submit({ reason, ...(trimmed ? { comment: trimmed } : {}) });
    if (!response) return;
    if (response.ok) {
      setOpen(false);
      setResult({
        ok: true,
        message: 'Gracias por avisar. Revisaremos la publicación.',
      });
      return;
    }
    const outcome = reportErrorOutcome(response.error);
    if (outcome.finished) {
      setOpen(false);
      setResult({ ok: false, message: outcome.message });
    } else {
      setFormError(outcome.message);
    }
  }

  if (result) {
    return <Alert variant={result.ok ? 'success' : 'info'}>{result.message}</Alert>;
  }

  return (
    <>
      <Button
        variant="secondary"
        onClick={() => setOpen(true)}
        className="w-full sm:w-auto sm:self-start"
      >
        Reportar esta publicación
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Reportar publicación"
        description="Cuéntanos qué está mal. Con varios reportes, la publicación se oculta hasta que un administrador la revise."
        initialFocusRef={firstReasonRef}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Volver
            </Button>
            <Button type="submit" form={formId} variant="danger" loading={isSubmitting}>
              Enviar reporte
            </Button>
          </>
        }
      >
        <form
          id={formId}
          noValidate
          onSubmit={(event) => void handleSubmit(event)}
          className="flex flex-col gap-4"
        >
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 font-bold">Motivo</legend>
            {REPORT_REASONS.map((option, index) => (
              <label
                key={option.value}
                className="flex min-h-11 items-center gap-3 rounded-field border border-line px-3"
              >
                <input
                  ref={index === 0 ? firstReasonRef : undefined}
                  type="radio"
                  name="reason"
                  value={option.value}
                  checked={reason === option.value}
                  onChange={() => setReason(option.value)}
                  className="size-5 shrink-0 accent-primary"
                />
                {option.label}
              </label>
            ))}
            {reasonError && (
              <p role="alert" className="text-[15px] font-bold text-danger">
                {reasonError}
              </p>
            )}
          </fieldset>
          <Textarea
            label="Comentario (opcional)"
            hint={`Hasta ${LISTING_TEXT_MAX} caracteres. ${comment.length} de ${LISTING_TEXT_MAX}.`}
            value={comment}
            maxLength={LISTING_TEXT_MAX}
            onChange={(event) => setComment(event.target.value)}
          />
          {formError && <Alert variant="error">{formError}</Alert>}
        </form>
      </Modal>
    </>
  );
}
