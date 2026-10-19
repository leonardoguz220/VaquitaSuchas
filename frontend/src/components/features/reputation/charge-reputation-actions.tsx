'use client';

import { useId, useRef, useState, type FormEvent } from 'react';
import type { ReviewNotice } from '@/components/features/charges/owner-review-model';
import { Alert, Button, Card, Modal, Textarea } from '@/components/ui';
import { useChargeReputationActions } from '@/hooks/use-charge-reputation-actions';
import type { Charge } from '@/services/charges';
import {
  REPUTATION_TEXT_MAX_LENGTH,
  REPUTATION_MESSAGES,
  reputationError,
  reputationSuccess,
  validateReputationText,
  type ReputationAction,
} from './charge-reputation-model';

export interface ChargeReputationActionsProps {
  charge: Charge;
  /** Aviso que queda en la página aunque este bloque desaparezca tras la acción. */
  onNotice: (notice: ReviewNotice | null) => void;
}

/**
 * «Reportar calificación» para el dueño del cobro y «Excluir de reputación» con motivo para el
 * titular (RF-007-14; CA-007-13). El frontend no sabe el rol: el dueño se reconoce porque la API
 * le ofrece `uploadReceipt`, y el titular por `confirm` o `reject` (mismo criterio que
 * `OwnerReviewActions`). La API valida el resto y responde los errores.
 */
export function ChargeReputationActions({ charge, onNotice }: ChargeReputationActionsProps) {
  const ids = useId();
  const textId = `${ids}-text`;
  const formId = `${ids}-form`;
  const { report, exclude, isReporting, isExcluding } = useChargeReputationActions(charge.id);

  const [open, setOpen] = useState<ReputationAction | null>(null);
  const [text, setText] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  const isOwner = charge.allowedActions.includes('uploadReceipt');
  const isHost =
    charge.allowedActions.includes('confirm') || charge.allowedActions.includes('reject');
  const busy = isReporting || isExcluding;
  const name = charge.member.fullName;

  if (!isOwner && !isHost) return null;

  function openModal(action: ReputationAction) {
    onNotice(null);
    setText('');
    setFieldError(null);
    setModalError(null);
    setOpen(action);
  }

  function closeModal() {
    if (busy) return;
    setOpen(null);
  }

  async function handleSubmit(action: ReputationAction, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setModalError(null);
    const problem = validateReputationText(text);
    setFieldError(problem);
    if (problem) {
      textRef.current?.focus();
      return;
    }
    const value = text.trim();
    const result = action === 'report' ? await report(value) : await exclude(value);
    if (!result) return;
    if (result.ok) {
      setOpen(null);
      setText('');
      onNotice(reputationSuccess(action));
      return;
    }
    const mapped = reputationError(result.error, action);
    if (mapped.target === 'page') {
      setOpen(null);
      onNotice(mapped.notice);
    } else if (mapped.target === 'field') {
      setFieldError(mapped.message);
      textRef.current?.focus();
    } else {
      setModalError(mapped.message);
    }
  }

  const length = text.trim().length;
  const hint = `Entre 10 y ${REPUTATION_TEXT_MAX_LENGTH} caracteres (${length}/${REPUTATION_TEXT_MAX_LENGTH}).`;

  function renderForm(action: ReputationAction) {
    const sending = action === 'report' ? isReporting : isExcluding;
    return (
      <form
        id={formId}
        noValidate
        onSubmit={(event) => handleSubmit(action, event)}
        className="flex flex-col gap-4"
      >
        {modalError && <Alert variant="error" title={modalError} />}
        <Textarea
          ref={textRef}
          id={textId}
          label={
            action === 'report'
              ? 'Comentario del reporte'
              : `Motivo (no contará para la reputación de ${name})`
          }
          hint={hint}
          error={fieldError ?? undefined}
          value={text}
          rows={3}
          maxLength={REPUTATION_TEXT_MAX_LENGTH}
          required
          disabled={sending}
          onChange={(event) => {
            setText(event.target.value);
            if (fieldError) setFieldError(null);
          }}
        />
      </form>
    );
  }

  return (
    <Card as="section" aria-labelledby={`${ids}-title`} className="flex flex-col gap-4">
      <h2 id={`${ids}-title`} className="font-display text-xl font-bold">
        Calificación de este cobro
      </h2>
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
        {isOwner && (
          <Button
            variant="secondary"
            onClick={() => openModal('report')}
            className="w-full sm:w-auto"
          >
            Reportar calificación
          </Button>
        )}
        {isHost && (
          <Button
            variant="secondary"
            onClick={() => openModal('exclude')}
            className="w-full sm:w-auto"
          >
            Excluir de reputación
          </Button>
        )}
      </div>

      <Modal
        open={open === 'report'}
        onClose={closeModal}
        title={REPUTATION_MESSAGES.reportTitle}
        description="Explica por qué la calificación de este cobro no es correcta."
        initialFocusRef={textRef}
        footer={
          <>
            <Button variant="secondary" onClick={closeModal} disabled={isReporting}>
              Volver
            </Button>
            <Button type="submit" form={formId} loading={isReporting}>
              Enviar reporte
            </Button>
          </>
        }
      >
        {renderForm('report')}
      </Modal>

      <Modal
        open={open === 'exclude'}
        onClose={closeModal}
        title={REPUTATION_MESSAGES.excludeTitle}
        description={`Este cobro dejará de contar en la reputación de ${name}. Quedará registrado quién lo excluyó y cuándo.`}
        initialFocusRef={textRef}
        footer={
          <>
            <Button variant="secondary" onClick={closeModal} disabled={isExcluding}>
              Volver
            </Button>
            <Button type="submit" form={formId} variant="danger" loading={isExcluding}>
              Excluir de reputación
            </Button>
          </>
        }
      >
        {renderForm('exclude')}
      </Modal>
    </Card>
  );
}
