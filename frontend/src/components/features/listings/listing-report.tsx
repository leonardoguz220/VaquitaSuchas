'use client';

import { useId, useRef, useState, type FormEvent } from 'react';
import { Alert, Button, Modal, Select, Textarea } from '@/components/ui';
import { useReportListing } from '@/hooks/use-report-listing';
import { LISTING_REPORT_COMMENT_MAX, type ListingReportReason } from '@/services/listings';
import { REPORT_MESSAGES, REPORT_REASON_LABEL, reportErrorText } from './listing-messages';

/** Motivos del contrato (`POST /listings/:id/reports`), en el orden de la lista. */
const REASONS: ListingReportReason[] = ['spam', 'datos_falsos', 'conducta_indebida', 'otro'];

/**
 * Reportar una publicación (RF-008-17). Abre un modal con el motivo (obligatorio) y un comentario
 * opcional de hasta 300 caracteres. Al enviar con éxito, cierra el modal y deja el aviso. El
 * servidor valida el motivo, el largo y las reglas; aquí solo se ayuda a la persona.
 */
export function ListingReportPanel({
  listingId,
  hideSent = false,
}: {
  listingId: string;
  /** Oculta el aviso de «Reporte enviado» mientras la persona hace otra acción en la pantalla. */
  hideSent?: boolean;
}) {
  const formId = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ListingReportReason | ''>('');
  const [comment, setComment] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const reasonRef = useRef<HTMLSelectElement>(null);
  const { send, isSubmitting } = useReportListing(listingId);

  function openModal() {
    setReason('');
    setComment('');
    setReasonError(null);
    setErrorText(null);
    setOpen(true);
  }

  function closeModal() {
    if (!isSubmitting) setOpen(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reason) {
      setReasonError(REPORT_MESSAGES.reasonRequired);
      reasonRef.current?.focus();
      return;
    }
    setReasonError(null);
    const trimmed = comment.trim();
    const outcome = await send(trimmed ? { reason, comment: trimmed } : { reason });
    // `null`: ya había un envío en curso o la sesión venció (ya se redirige).
    if (!outcome) return;
    if (outcome.ok) {
      setOpen(false);
      setSent(true);
    } else {
      setErrorText(reportErrorText(outcome.error));
    }
  }

  return (
    <div className="flex flex-col gap-4 border-t border-line pt-6">
      {sent ? (
        hideSent ? null : (
          <Alert variant="success" title={REPORT_MESSAGES.sentTitle}>
            {REPORT_MESSAGES.sentBody}
          </Alert>
        )
      ) : (
        <Button variant="secondary" onClick={openModal} className="self-start">
          {REPORT_MESSAGES.report}
        </Button>
      )}

      <Modal
        open={open}
        onClose={closeModal}
        title={REPORT_MESSAGES.formTitle}
        description={REPORT_MESSAGES.formDescription}
        closeLabel={REPORT_MESSAGES.close}
        initialFocusRef={reasonRef}
        footer={
          <>
            <Button variant="secondary" disabled={isSubmitting} onClick={closeModal}>
              {REPORT_MESSAGES.cancel}
            </Button>
            <Button type="submit" form={formId} loading={isSubmitting}>
              {isSubmitting ? REPORT_MESSAGES.sending : REPORT_MESSAGES.send}
            </Button>
          </>
        }
      >
        <form id={formId} onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <Select
            ref={reasonRef}
            name="reason"
            label={REPORT_MESSAGES.reasonLabel}
            placeholder={REPORT_MESSAGES.reasonPlaceholder}
            value={reason}
            error={reasonError}
            disabled={isSubmitting}
            onChange={(event) => setReason(event.target.value as ListingReportReason | '')}
          >
            {REASONS.map((value) => (
              <option key={value} value={value}>
                {REPORT_REASON_LABEL[value]}
              </option>
            ))}
          </Select>
          <Textarea
            name="comment"
            label={REPORT_MESSAGES.commentLabel}
            hint={`${comment.length}/${LISTING_REPORT_COMMENT_MAX}`}
            value={comment}
            maxLength={LISTING_REPORT_COMMENT_MAX}
            rows={3}
            disabled={isSubmitting}
            onChange={(event) => setComment(event.target.value)}
          />
          {errorText && <Alert variant="error">{errorText}</Alert>}
        </form>
      </Modal>
    </div>
  );
}
