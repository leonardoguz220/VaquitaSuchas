'use client';

import { useId, useRef, useState, type FormEvent } from 'react';
import { Alert, Button, Card, Modal, Textarea } from '@/components/ui';
import { useMe } from '@/hooks/use-me';
import { useExcludeChargeFromReputation, useReportChargeRating } from '@/hooks/use-reputation';
import type { ApiSubmitResult } from '@/hooks/use-api-submit';
import type { Charge } from '@/services/charges';
import { REPUTATION_REASON_MAX, REPUTATION_REASON_MIN } from '@/services/reputation';
import { correctionErrorOutcome, type ReputationCorrectionKind } from './reputation-messages';

interface ModalCopy {
  title: string;
  description: string;
  label: string;
  submit: string;
}

const COPY: Record<ReputationCorrectionKind, ModalCopy> = {
  report: {
    title: 'Reportar calificación',
    description:
      'Si crees que este cobro se calificó mal (por ejemplo, pagaste a tiempo y figura tarde), cuéntale al titular. Él lo revisa y puede excluirlo de tu reputación.',
    label: 'Qué pasó (lo verá el titular)',
    submit: 'Enviar reporte',
  },
  exclusion: {
    title: 'Excluir de reputación',
    description:
      'El cobro dejará de contar para la calificación de puntualidad de la persona. Queda registrado quién lo excluyó y cuándo.',
    label: 'Motivo (queda registrado)',
    submit: 'Excluir de reputación',
  },
};

interface ReasonModalProps {
  kind: ReputationCorrectionKind;
  open: boolean;
  onClose: () => void;
  submit: (text: string) => Promise<ApiSubmitResult<void> | null>;
  isSubmitting: boolean;
  onDone: (message: string, finishedByError: boolean) => void;
}

/** Modal con el texto obligatorio (10 a 300 caracteres) del reporte o de la exclusión. */
function ReasonModal({ kind, open, onClose, submit, isSubmitting, onDone }: ReasonModalProps) {
  const copy = COPY[kind];
  const formId = useId();
  const textRef = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = text.trim();
    if (trimmed.length < REPUTATION_REASON_MIN || trimmed.length > REPUTATION_REASON_MAX) {
      setFieldError(
        `Escribe entre ${REPUTATION_REASON_MIN} y ${REPUTATION_REASON_MAX} caracteres.`,
      );
      textRef.current?.focus();
      return;
    }
    setFieldError(null);
    setFormError(null);
    const result = await submit(trimmed);
    if (!result) return;
    if (result.ok) {
      setText('');
      onDone(
        kind === 'report'
          ? 'Enviamos tu reporte al titular. Te avisaremos si excluye el cobro.'
          : 'Excluiste el cobro de la reputación. La calificación de la persona ya se recalculó.',
        false,
      );
      return;
    }
    const outcome = correctionErrorOutcome(kind, result.error);
    if (outcome.finished) {
      onDone(outcome.message, true);
      return;
    }
    if (outcome.field) setFieldError(outcome.message);
    else setFormError(outcome.message);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={copy.title}
      description={copy.description}
      initialFocusRef={textRef}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Volver
          </Button>
          <Button
            type="submit"
            form={formId}
            variant={kind === 'exclusion' ? 'danger' : 'primary'}
            loading={isSubmitting}
          >
            {copy.submit}
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
          ref={textRef}
          label={copy.label}
          hint={`Entre ${REPUTATION_REASON_MIN} y ${REPUTATION_REASON_MAX} caracteres. ${text.trim().length} de ${REPUTATION_REASON_MAX}.`}
          value={text}
          maxLength={REPUTATION_REASON_MAX}
          required
          error={fieldError}
          onChange={(event) => setText(event.target.value)}
        />
        {formError && <Alert variant="error">{formError}</Alert>}
      </form>
    </Modal>
  );
}

/**
 * Indica si el cobro puede contar para la reputación según lo que entrega la API (RN-007-01 y
 * RN-007-09): de origen `ciclo` y en `pagado` o `atrasado`. Solo decide si se ofrecen los
 * botones; quien valida es el backend.
 */
export function chargeCountsForReputation(charge: Pick<Charge, 'status' | 'origin'>): boolean {
  return charge.origin === 'ciclo' && (charge.status === 'pagado' || charge.status === 'atrasado');
}

function CorrectionCard({ kind, charge }: { kind: ReputationCorrectionKind; charge: Charge }) {
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<{ message: string; byError: boolean } | null>(null);
  const report = useReportChargeRating(charge.id);
  const exclusion = useExcludeChargeFromReputation(charge.id);
  const action = kind === 'report' ? report : exclusion;

  return (
    <Card as="section" aria-labelledby={titleId} className="flex flex-col gap-3">
      <h2 id={titleId} className="font-display text-xl font-bold">
        Reputación
      </h2>
      {result ? (
        <Alert variant={result.byError ? 'info' : 'success'}>{result.message}</Alert>
      ) : (
        <>
          <p className="text-[15px] text-muted">
            {kind === 'report'
              ? 'Este cobro cuenta para tu calificación de puntualidad.'
              : `Este cobro cuenta para la calificación de puntualidad de ${charge.member.fullName}. Si se calificó mal por un error, puedes excluirlo.`}
          </p>
          <Button
            variant="secondary"
            onClick={() => setOpen(true)}
            className="w-full sm:w-auto sm:self-start"
          >
            {COPY[kind].title}
          </Button>
          <ReasonModal
            kind={kind}
            open={open}
            onClose={() => setOpen(false)}
            submit={action.submit}
            isSubmitting={action.isSubmitting}
            onDone={(message, byError) => {
              setOpen(false);
              setResult({ message, byError });
            }}
          />
        </>
      )}
    </Card>
  );
}

/**
 * En `/cobros/[id]` (spec 007 T032, plan §6): **Reportar calificación** para la persona del cobro
 * y **Excluir de reputación** con motivo para el titular (RF-007-14). Solo ven el `Charge`
 * completo el dueño y el titular, así que si quien consulta no es el dueño es el titular. La API
 * responde `403` si no corresponde y el aviso lo explica.
 */
export function ChargeReputationActions({ charge }: { charge: Charge }) {
  const { status, user } = useMe();
  if (status !== 'success' || !user) return null;
  const kind: ReputationCorrectionKind = user.id === charge.member.userId ? 'report' : 'exclusion';
  return <CorrectionCard kind={kind} charge={charge} />;
}
