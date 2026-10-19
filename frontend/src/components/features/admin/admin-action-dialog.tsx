'use client';

import { useId, useState, type FormEvent } from 'react';
import { Alert, Button, Modal, Textarea } from '@/components/ui';
import type { ApiSubmitResult } from '@/hooks/use-api-submit';
import { REASON_LIMITS } from './admin-labels';

export interface AdminActionDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Qué pasa al confirmar, con sus efectos (sesiones, avisos, auditoría). */
  description: string;
  confirmLabel: string;
  /** Acción que quita acceso o cambia la titularidad: el botón usa el estilo de peligro. */
  danger?: boolean;
  /** Motivo obligatorio de 10 a 300 caracteres; las acciones que lo dejan opcional lo indican. */
  reasonRequired?: boolean;
  /** Envía la acción con el motivo; con éxito la pantalla cierra el diálogo. */
  onConfirm: (reason: string) => Promise<ApiSubmitResult<unknown> | null>;
}

/**
 * Confirmación explícita de una acción sensible (RNF-009-02): explica el efecto, pide un motivo
 * de 10 a 300 caracteres con contador y solo envía al pulsar el botón de confirmar. El servidor
 * vuelve a validar el motivo; aquí solo se ayuda a la persona antes de enviar.
 */
export function AdminActionDialog({
  open,
  onClose,
  title,
  description,
  confirmLabel,
  danger = false,
  reasonRequired = true,
  onConfirm,
}: AdminActionDialogProps) {
  const formId = useId();
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Cada vez que se abre, empieza en blanco: no se reutiliza un motivo de otra acción.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    setReason('');
    setReasonError(null);
    setErrorText(null);
  }

  function close() {
    if (!isSubmitting) onClose();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = reason.trim();
    if (
      reasonRequired &&
      (trimmed.length < REASON_LIMITS.min || trimmed.length > REASON_LIMITS.max)
    ) {
      setReasonError(`El motivo va de ${REASON_LIMITS.min} a ${REASON_LIMITS.max} caracteres.`);
      return;
    }
    if (!reasonRequired && trimmed.length > REASON_LIMITS.max) {
      setReasonError(`El motivo va de ${REASON_LIMITS.min} a ${REASON_LIMITS.max} caracteres.`);
      return;
    }
    setReasonError(null);
    setErrorText(null);
    setIsSubmitting(true);
    const outcome = await onConfirm(trimmed);
    setIsSubmitting(false);
    // `null`: ya había un envío en curso o la sesión venció (ya se redirige).
    if (!outcome) return;
    if (outcome.ok) onClose();
    else setErrorText(outcome.error.message);
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="secondary" disabled={isSubmitting} onClick={close}>
            Cancelar
          </Button>
          <Button
            type="submit"
            form={formId}
            variant={danger ? 'danger' : 'primary'}
            loading={isSubmitting}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <Textarea
          name="reason"
          label={
            reasonRequired
              ? 'Motivo (de 10 a 300 caracteres)'
              : 'Motivo (opcional, hasta 300 caracteres)'
          }
          hint={`${reason.length} / ${REASON_LIMITS.max} · queda en auditoría`}
          value={reason}
          maxLength={REASON_LIMITS.max}
          rows={3}
          error={reasonError}
          disabled={isSubmitting}
          onChange={(event) => setReason(event.target.value)}
        />
        {errorText && <Alert variant="error">{errorText}</Alert>}
      </form>
    </Modal>
  );
}
