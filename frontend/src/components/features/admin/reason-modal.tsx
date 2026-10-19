'use client';

import { useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Alert, Button, Modal, Textarea, type ButtonVariant } from '@/components/ui';
import { ADMIN_REASON_MAX, ADMIN_REASON_MIN } from '@/services/admin-users';
import { ADMIN_MESSAGES, reasonLengthMessage } from './admin-messages';

/** Resultado del envío: `ok`, error (junto al motivo o general) o `null` (se ignora). */
export type ReasonModalResult =
  { ok: true } | { ok: false; message: string; field: 'reason' | null } | null;

export interface ReasonModalProps {
  title: string;
  description: ReactNode;
  confirmLabel: string;
  confirmVariant?: ButtonVariant;
  /** Motivo obligatorio de 10 a 300 caracteres (RN-009-04); si no, opcional. */
  reasonRequired?: boolean;
  reasonLabel?: string;
  /** Campos extra antes del motivo (por ejemplo, el nuevo titular). */
  children?: ReactNode;
  /** Validación de los campos extra; devuelve el error o `null`. */
  validate?: () => string | null;
  onConfirm: (reason: string) => Promise<ReasonModalResult>;
  onClose: () => void;
}

/**
 * Confirmación explícita de una acción sensible del panel de administración (RNF-009-02, plan
 * 009 §6): el botón de la ficha abre este modal y la acción solo se envía al pulsar el botón de
 * confirmar (doble paso), con el motivo de 10 a 300 caracteres y su contador. La validación del
 * largo solo ayuda: el servidor valida siempre (`400`).
 * Se monta solo mientras está abierto, así cada apertura empieza con el motivo vacío.
 */
export function ReasonModal({
  title,
  description,
  confirmLabel,
  confirmVariant = 'danger',
  reasonRequired = true,
  reasonLabel,
  children,
  validate,
  onConfirm,
  onClose,
}: ReasonModalProps) {
  const formId = useId();
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;
    const trimmed = reason.trim();
    const extraError = validate?.() ?? null;
    const lengthOk = trimmed.length >= ADMIN_REASON_MIN && trimmed.length <= ADMIN_REASON_MAX;
    const reasonInvalid = (reasonRequired || trimmed.length > 0) && !lengthOk;
    setReasonError(reasonInvalid ? reasonLengthMessage() : null);
    setFormError(extraError);
    if (reasonInvalid) {
      reasonRef.current?.focus();
      return;
    }
    if (extraError) return;
    setIsSubmitting(true);
    try {
      const result = await onConfirm(trimmed);
      if (result && !result.ok) {
        if (result.field === 'reason') {
          setReasonError(result.message);
          reasonRef.current?.focus();
        } else {
          setFormError(result.message);
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  const label =
    reasonLabel ??
    (reasonRequired
      ? `Motivo (de ${ADMIN_REASON_MIN} a ${ADMIN_REASON_MAX} caracteres)`
      : `Motivo (opcional, de ${ADMIN_REASON_MIN} a ${ADMIN_REASON_MAX} caracteres)`);

  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      description={description}
      initialFocusRef={children ? undefined : reasonRef}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form={formId} variant={confirmVariant} loading={isSubmitting}>
            {confirmLabel}
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
        {children}
        <Textarea
          ref={reasonRef}
          label={label}
          hint={`${reason.length} / ${ADMIN_REASON_MAX} · ${ADMIN_MESSAGES.audited}`}
          error={reasonError ?? undefined}
          value={reason}
          maxLength={ADMIN_REASON_MAX}
          required={reasonRequired}
          onChange={(event) => setReason(event.target.value)}
        />
        {formError && <Alert variant="error">{formError}</Alert>}
      </form>
    </Modal>
  );
}
