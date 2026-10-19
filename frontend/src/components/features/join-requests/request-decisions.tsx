'use client';

import { useId, useRef, useState, type FormEvent } from 'react';
import { Alert, Button, Card, Modal, Textarea } from '@/components/ui';
import {
  useCancelJoinRequest,
  useCashPayment,
  useConfirmJoinRequest,
  useRejectJoinRequest,
} from '@/hooks/use-join-requests';
import { formatBs } from '@/lib/money';
import type { JoinRequest } from '@/services/join-requests';
import {
  actionErrorOutcome,
  decisionMessage,
  REQUEST_MESSAGES,
  type ActionErrorOutcome,
} from './join-messages';

const REASON_MIN = 5;
const REASON_MAX = 200;

export interface DecisionCallbacks {
  /** La API devolvió la solicitud ya cambiada: se muestra con su aviso. */
  onChanged: (request: JoinRequest, message: string) => void;
  /** La solicitud cambió en el servidor: se vuelve a pedir y se avisa. */
  onStale: (message: string) => void;
}

interface ModalProps extends DecisionCallbacks {
  request: JoinRequest;
  open: boolean;
  onClose: () => void;
}

/** Aplica el resultado de un error: recarga si cambió en el servidor o muestra el aviso. */
function handleOutcome(
  outcome: ActionErrorOutcome,
  onStale: (message: string) => void,
  show: (message: string) => void,
  close?: () => void,
) {
  if (outcome.refresh) {
    close?.();
    onStale(outcome.message);
  } else {
    show(outcome.message);
  }
}

/**
 * Modal **Rechazar** (RF-010-16; mockup `SolicitudTitular.dc.html`): motivo obligatorio de 5 a
 * 200 caracteres y, si la solicitud tiene el pago informado, la casilla «el comprobante me parece
 * falso» que habilita el reclamo por comprobante falso (RF-010-21).
 */
function RejectModal({ request, open, onClose, onChanged, onStale }: ModalProps) {
  const formId = useId();
  const checkboxId = useId();
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const [reason, setReason] = useState('');
  const [markFalse, setMarkFalse] = useState(false);
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const { submit, isSubmitting } = useRejectJoinRequest(request.id);
  const proofReported = request.phase.status === 'pago_informado';
  const name = request.applicant.fullName;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = reason.trim();
    if (trimmed.length < REASON_MIN || trimmed.length > REASON_MAX) {
      setReasonError(REQUEST_MESSAGES.reasonLength);
      reasonRef.current?.focus();
      return;
    }
    setReasonError(null);
    setFormError(null);
    const result = await submit({
      reason: trimmed,
      ...(proofReported ? { markProofAsFalse: markFalse } : {}),
      version: request.version,
    });
    if (!result) return;
    if (result.ok) {
      setReason('');
      setMarkFalse(false);
      onClose();
      onChanged(result.data, decisionMessage('reject', name));
      return;
    }
    const outcome = actionErrorOutcome(result.error);
    if (result.error.code === 'VALIDATION_ERROR') {
      setReasonError(REQUEST_MESSAGES.reasonLength);
      return;
    }
    handleOutcome(outcome, onStale, setFormError, onClose);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Rechazar solicitud"
      description={`${name} verá el motivo y la solicitud terminará. El cupo reservado queda libre.`}
      initialFocusRef={reasonRef}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Volver
          </Button>
          <Button type="submit" form={formId} variant="danger" loading={isSubmitting}>
            Rechazar solicitud
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
        <Textarea
          ref={reasonRef}
          label={`Motivo (lo verá ${name})`}
          hint={`Entre ${REASON_MIN} y ${REASON_MAX} caracteres. ${reason.trim().length} de ${REASON_MAX}.`}
          value={reason}
          maxLength={REASON_MAX}
          required
          error={reasonError}
          onChange={(event) => setReason(event.target.value)}
        />
        {proofReported && (
          <div className="flex items-start gap-3">
            <input
              id={checkboxId}
              type="checkbox"
              checked={markFalse}
              onChange={(event) => setMarkFalse(event.target.checked)}
              className="mt-1 size-5 shrink-0 accent-primary"
            />
            <label htmlFor={checkboxId} className="flex flex-col">
              <span className="font-bold">El comprobante me parece falso</span>
              <span className="text-[15px] text-muted">
                Podrás abrir un reclamo para que un administrador lo revise.
              </span>
            </label>
          </div>
        )}
        {formError && <Alert variant="error">{formError}</Alert>}
      </form>
    </Modal>
  );
}

interface ConfirmModalProps extends ModalProps {
  title: string;
  description: string;
  confirmLabel: string;
  variant: 'primary' | 'danger';
  isSubmitting: boolean;
  onConfirm: () => Promise<string | null>;
}

/** Modal de confirmación de una acción sin datos (efectivo, cancelar). */
function ConfirmActionModal({
  open,
  onClose,
  title,
  description,
  confirmLabel,
  variant,
  isSubmitting,
  onConfirm,
}: ConfirmModalProps) {
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Volver
          </Button>
          <Button
            variant={variant}
            loading={isSubmitting}
            onClick={() => {
              setProblem(null);
              void onConfirm().then((message) => setProblem(message));
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {problem && <Alert variant="error">{problem}</Alert>}
    </Modal>
  );
}

export interface DecisionActionsProps extends DecisionCallbacks {
  request: JoinRequest;
}

/**
 * Botones de decisión de `/solicitudes/[id]` según `allowedActions` (spec 010 T030; mockups
 * `SolicitudTitular.dc.html` y `SolicitudAbierta.dc.html`): **Confirmar ingreso**, **Pago en
 * efectivo** y **Rechazar** para el titular; **Cancelar solicitud** para el solicitante. El
 * frontend no decide quién puede hacerlo: el backend responde `403` o `409` si no corresponde.
 */
export function DecisionActions({ request, onChanged, onStale }: DecisionActionsProps) {
  const [openModal, setOpenModal] = useState<'reject' | 'cash' | 'cancel' | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const confirm = useConfirmJoinRequest(request.id);
  const cash = useCashPayment(request.id);
  const cancel = useCancelJoinRequest(request.id);
  const can = (action: JoinRequest['allowedActions'][number]) =>
    request.allowedActions.includes(action);
  const name = request.applicant.fullName;
  const close = () => setOpenModal(null);

  async function handleConfirm() {
    setProblem(null);
    const result = await confirm.submit({ version: request.version });
    if (!result) return;
    if (result.ok) onChanged(result.data, decisionMessage('confirm', name));
    else handleOutcome(actionErrorOutcome(result.error), onStale, setProblem);
  }

  async function runInModal(
    submit: typeof cash.submit,
    success: string,
    forbidden: string,
  ): Promise<string | null> {
    const result = await submit({ version: request.version });
    if (!result) return null;
    if (result.ok) {
      close();
      onChanged(result.data, success);
      return null;
    }
    const outcome = actionErrorOutcome(result.error);
    if (outcome.refresh) {
      close();
      onStale(outcome.message);
      return null;
    }
    return result.error.statusCode === 403 ? forbidden : outcome.message;
  }

  return (
    <>
      {problem && (
        <Alert variant="error" className="basis-full">
          {problem}
        </Alert>
      )}
      {can('confirm') && (
        <Button onClick={() => void handleConfirm()} loading={confirm.isSubmitting}>
          Confirmar ingreso
        </Button>
      )}
      {can('cashPayment') && (
        <Button variant="secondary" onClick={() => setOpenModal('cash')}>
          Pago en efectivo
        </Button>
      )}
      {can('reject') && (
        <Button variant="danger" onClick={() => setOpenModal('reject')}>
          Rechazar
        </Button>
      )}
      {can('cancel') && (
        <Button variant="danger" onClick={() => setOpenModal('cancel')}>
          Cancelar solicitud
        </Button>
      )}
      {can('reject') && (
        <RejectModal
          request={request}
          open={openModal === 'reject'}
          onClose={close}
          onChanged={onChanged}
          onStale={onStale}
        />
      )}
      {can('cashPayment') && (
        <ConfirmActionModal
          request={request}
          open={openModal === 'cash'}
          onClose={close}
          onChanged={onChanged}
          onStale={onStale}
          title="Registrar pago en efectivo"
          description={`Acepta a ${name} sin comprobante, con la cuota ya fijada. Hazlo solo si ya recibiste el dinero.`}
          confirmLabel="Registrar pago en efectivo"
          variant="primary"
          isSubmitting={cash.isSubmitting}
          onConfirm={() =>
            runInModal(cash.submit, decisionMessage('cash', name), REQUEST_MESSAGES.hostOnly)
          }
        />
      )}
      {can('cancel') && (
        <ConfirmActionModal
          request={request}
          open={openModal === 'cancel'}
          onClose={close}
          onChanged={onChanged}
          onStale={onStale}
          title="Cancelar solicitud"
          description="La solicitud termina y el cupo reservado queda libre. Después de informar tu pago ya no podrás cancelarla."
          confirmLabel="Cancelar solicitud"
          variant="danger"
          isSubmitting={cancel.isSubmitting}
          onConfirm={() =>
            runInModal(cancel.submit, REQUEST_MESSAGES.cancelled, REQUEST_MESSAGES.applicantOnly)
          }
        />
      )}
    </>
  );
}

/** Indica si la API ofrece alguna decisión a quien mira. */
export function hasDecisionActions(request: Pick<JoinRequest, 'allowedActions'>): boolean {
  return request.allowedActions.some((action) =>
    ['confirm', 'cashPayment', 'reject', 'cancel'].includes(action),
  );
}

/**
 * Recordatorio antes de confirmar (mockup `SolicitudTitular.dc.html`): revisar en el banco el
 * monto fijado por la API y la referencia del comprobante.
 */
export function HostCheckBank({ request }: { request: JoinRequest }) {
  const titleId = useId();
  if (!request.allowedActions.includes('confirm') || !request.quote) return null;
  return (
    <Card as="section" aria-labelledby={titleId} className="flex flex-col gap-2">
      <h2 id={titleId} className="font-display text-xl font-bold">
        Antes de confirmar
      </h2>
      <p>
        Revisa en tu banco que llegaron <strong>{formatBs(request.quote.amountCents)}</strong>
        {request.proof ? ` con la referencia ${request.proof.reference}` : ''}. Al confirmar,{' '}
        {request.applicant.fullName} se une al grupo y este pago queda como su cobro del mes, ya
        pagado.
      </p>
    </Card>
  );
}
