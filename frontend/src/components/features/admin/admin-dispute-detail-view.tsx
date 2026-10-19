'use client';

import Link from 'next/link';
import { useId, useState } from 'react';
import {
  DISPUTE_KIND_LABEL,
  DISPUTE_RESULT_LABEL,
} from '@/components/features/join-requests/join-messages';
import { ProofSummary } from '@/components/features/join-requests/proof-summary';
import { RequestTimeline } from '@/components/features/join-requests/request-timeline';
import { Alert, Button, Card } from '@/components/ui';
import { useAdminDisputeEvidence, useResolveDispute } from '@/hooks/use-admin-disputes';
import { formatDateTimeLaPaz } from '@/lib/dates';
import { formatBs } from '@/lib/money';
import { ADMIN_DISPUTES_PATH, PANEL_PATH, safeHttpUrl } from '@/lib/routes';
import type { AdminDisputeEvidence, AdminDisputeRow } from '@/services/admin-disputes';
import { isConnectionError } from '@/services/http';
import type { DisputeResult } from '@/services/join-requests';
import { adminActionOutcome, ADMIN_MESSAGES, DISPUTE_PARTY_LABEL } from './admin-messages';
import { disputePartiesText, DisputeStatusBadge } from './admin-disputes-view';
import { ReasonModal, type ReasonModalResult } from './reason-modal';

/** Aviso antes de abrir la evidencia (RN-009-08, CA-009-27). */
export const EVIDENCE_NOTICE =
  'Ver la evidencia abre el chat y el comprobante privados. Esta apertura queda registrada en auditoría.';

/** Enlace a un archivo firmado (comprobante o imagen) en otra pestaña; nunca se interpreta HTML. */
function FileLink({ url, label }: { url: string | null; label: string }) {
  const safe = safeHttpUrl(url);
  if (!safe) return <span className="text-[15px] text-muted">{label}: archivo no disponible</span>;
  return (
    <a
      href={safe}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-11 items-center font-bold"
    >
      {label} (se abre en otra pestaña)
    </a>
  );
}

function ChatSection({ evidence }: { evidence: AdminDisputeEvidence }) {
  const titleId = useId();
  return (
    <Card as="section" aria-labelledby={titleId} className="flex flex-col gap-3">
      <h2 id={titleId} className="font-display text-xl font-bold">
        Chat (solo lectura)
      </h2>
      {evidence.messages.length === 0 ? (
        <p className="text-muted">El chat no tiene mensajes o ya se eliminó por retención.</p>
      ) : (
        <ol aria-label="Mensajes del chat" className="flex flex-col gap-3">
          {evidence.messages.map((message) => (
            <li key={message.id} className="flex flex-col gap-1 rounded-field bg-bg p-3">
              <span className="text-[15px] text-muted">
                <span className="font-bold text-ink">{message.sender.fullName}</span> ·{' '}
                <time dateTime={message.createdAt}>{formatDateTimeLaPaz(message.createdAt)}</time>
              </span>
              {message.body && <p className="break-words whitespace-pre-wrap">{message.body}</p>}
              {message.imageUrl !== null && <FileLink url={message.imageUrl} label="Ver imagen" />}
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

function ClaimsSection({ evidence }: { evidence: AdminDisputeEvidence }) {
  const titleId = useId();
  return (
    <Card as="section" aria-labelledby={titleId} className="flex flex-col gap-3">
      <h2 id={titleId} className="font-display text-xl font-bold">
        Descripciones y respuestas
      </h2>
      {evidence.claims.map((claim) => (
        <div
          key={claim.id}
          className="flex flex-col gap-2 border-b border-line pb-3 last:border-b-0"
        >
          <p className="font-bold">
            {DISPUTE_KIND_LABEL[claim.kind] ?? claim.kind}: {claim.openedBy.fullName} ·{' '}
            {formatDateTimeLaPaz(claim.openedAt)}
          </p>
          <p className="break-words whitespace-pre-wrap">«{claim.description}»</p>
          {claim.evidenceUrl !== null && (
            <FileLink url={claim.evidenceUrl} label="Ver imagen del reclamo" />
          )}
          {claim.response ? (
            <div className="flex flex-col gap-1 border-l-2 border-line pl-3">
              <p className="text-[15px] text-muted">
                Respuesta · {formatDateTimeLaPaz(claim.response.respondedAt)}
              </p>
              <p className="break-words whitespace-pre-wrap">«{claim.response.text}»</p>
              {claim.response.evidenceUrl !== null && (
                <FileLink url={claim.response.evidenceUrl} label="Ver imagen de la respuesta" />
              )}
            </div>
          ) : (
            <p className="text-[15px] text-muted">La otra parte no respondió.</p>
          )}
        </div>
      ))}
    </Card>
  );
}

function ResultOption({
  name,
  value,
  checked,
  onChange,
  title,
  description,
}: {
  name: string;
  value: DisputeResult;
  checked: boolean;
  onChange: (value: DisputeResult) => void;
  title: string;
  description: string;
}) {
  return (
    <label className="flex min-h-11 items-start gap-3 rounded-field border border-line p-3">
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={() => onChange(value)}
        className="mt-1 size-5 shrink-0 accent-primary"
      />
      <span className="flex flex-col">
        <span className="font-bold">{title}</span>
        <span className="text-[15px] text-muted">{description}</span>
      </span>
    </label>
  );
}

function scamDescription(dispute: AdminDisputeRow): string {
  const who = `${dispute.accused.fullName} (${DISPUTE_PARTY_LABEL[dispute.accused.role]})`;
  const groups = dispute.accused.role === 'titular' ? ' Sus grupos quedan en solo lectura.' : '';
  return `Se banea a ${who} y se bloquean su correo, su celular, su CI y su cuenta de Telegram.${groups}`;
}

function ResolveSection({ dispute }: { dispute: AdminDisputeRow }) {
  const radioName = useId();
  const { submit } = useResolveDispute(dispute.id);
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<DisputeResult | null>(null);
  const [done, setDone] = useState<{ ok: boolean; message: string } | null>(null);

  async function confirm(reason: string): Promise<ReasonModalResult> {
    if (!result) return null;
    const response = await submit({ result, reason });
    if (!response) return null;
    if (response.ok) {
      setOpen(false);
      setDone({
        ok: true,
        message: `Resolviste el reclamo como «${DISPUTE_RESULT_LABEL[result]}». Las dos partes ven la decisión y el motivo.`,
      });
      return { ok: true };
    }
    const outcome = adminActionOutcome(response.error);
    if (outcome.refresh) {
      setOpen(false);
      setDone({ ok: false, message: 'El reclamo ya estaba resuelto. No se cambió nada.' });
      return null;
    }
    return { ok: false, message: outcome.message, field: outcome.field };
  }

  if (done) return <Alert variant={done.ok ? 'success' : 'warning'}>{done.message}</Alert>;

  return (
    <section aria-labelledby={`${radioName}-title`} className="flex flex-col gap-3">
      <h2 id={`${radioName}-title`} className="font-display text-xl font-bold">
        Resolver
      </h2>
      <p className="text-muted">
        Un reclamo por sí solo no banea a nadie: decides tú, con un motivo que verán ambas partes.
      </p>
      <Button
        variant="danger"
        onClick={() => {
          setResult(null);
          setOpen(true);
        }}
        className="w-full sm:w-auto sm:self-start"
      >
        Resolver reclamo
      </Button>
      {open && (
        <ReasonModal
          title="Resolver el reclamo"
          description="Elige el resultado. Queda en auditoría con tu nombre."
          confirmLabel={
            result === 'estafa_confirmada'
              ? 'Confirmar estafa y banear'
              : result === 'sin_falta'
                ? 'Resolver sin falta'
                : 'Resolver reclamo'
          }
          reasonLabel="Motivo (de 10 a 300 caracteres, lo verán ambas partes)"
          validate={() => (result ? null : 'Elige un resultado.')}
          onConfirm={confirm}
          onClose={() => setOpen(false)}
        >
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 font-bold">Resultado</legend>
            <ResultOption
              name={radioName}
              value="estafa_confirmada"
              checked={result === 'estafa_confirmada'}
              onChange={setResult}
              title="Estafa confirmada"
              description={scamDescription(dispute)}
            />
            <ResultOption
              name={radioName}
              value="sin_falta"
              checked={result === 'sin_falta'}
              onChange={setResult}
              title="Sin falta"
              description="No se sanciona a nadie. Las dos partes ven la decisión y el motivo."
            />
          </fieldset>
        </ReasonModal>
      )}
    </section>
  );
}

function EvidenceContent({ evidence }: { evidence: AdminDisputeEvidence }) {
  const { dispute, quote, proof } = evidence;
  return (
    <>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-display text-2xl font-bold break-words">
            {DISPUTE_KIND_LABEL[dispute.kind] ?? dispute.kind} · {dispute.group.name}
          </h2>
          <DisputeStatusBadge status={dispute.status} />
        </div>
        <p className="break-words">
          {disputePartiesText(dispute)} · {formatDateTimeLaPaz(dispute.openedAt)}
          {quote && <> · Cuota cotizada {formatBs(quote.amountCents)}</>}
          {proof && <> · Ref. {proof.reference}</>}
        </p>
      </div>
      <Alert variant="info">
        Abriste la evidencia. Esta apertura quedó registrada en auditoría.
      </Alert>

      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <ChatSection evidence={evidence} />
        <div className="flex flex-col gap-4">
          {proof ? (
            <ProofSummary proof={proof}>
              <FileLink url={proof.fileUrl} label="Abrir comprobante" />
            </ProofSummary>
          ) : (
            <Card as="section" aria-label="Comprobante de ingreso">
              <p className="text-muted">No hay comprobante en esta solicitud.</p>
            </Card>
          )}
          <ClaimsSection evidence={evidence} />
        </div>
      </div>

      <RequestTimeline events={evidence.timeline} />

      {dispute.status === 'abierto' ? (
        <ResolveSection dispute={dispute} />
      ) : (
        <Alert variant="info">
          Este reclamo ya está resuelto
          {dispute.result && <> como «{DISPUTE_RESULT_LABEL[dispute.result]}»</>}.
        </Alert>
      )}
    </>
  );
}

/**
 * `/admin/reclamos/[id]` (spec 009 T024, plan §6; mockup `AdminReclamo.dc.html`): la evidencia
 * **no** se pide al abrir la pantalla; el administrador pulsa «Ver evidencia» tras el aviso de
 * que la apertura queda registrada (CA-009-27, RN-009-08). Después ve la línea de tiempo, el chat
 * de solo lectura, el comprobante, las descripciones y respuestas, y puede **Resolver** con
 * resultado y motivo (RF-009-20). Todo el contenido de las personas se muestra como texto.
 */
export function AdminDisputeDetailView({ disputeId }: { disputeId: string }) {
  const evidence = useAdminDisputeEvidence(disputeId);
  const error = evidence.error;
  return (
    <>
      <Link href={ADMIN_DISPUTES_PATH} className="inline-flex min-h-11 items-center self-start">
        Volver a reclamos
      </Link>
      <h1 className="font-display text-3xl leading-tight font-bold tracking-tight sm:text-4xl">
        Reclamo
      </h1>

      {evidence.status !== 'success' && (
        <Card className="flex flex-col gap-4">
          <Alert variant="warning">{EVIDENCE_NOTICE}</Alert>
          {evidence.status === 'error' && error && (
            <Alert
              variant="error"
              title="No pudimos abrir la evidencia."
              action={
                error.statusCode === 403 ? (
                  <Button variant="secondary" href={PANEL_PATH}>
                    Ir a mi panel
                  </Button>
                ) : undefined
              }
            >
              {error.statusCode === 403
                ? 'No puedes ver esta evidencia: el reclamo ya no está abierto o tu cuenta no es administradora.'
                : error.statusCode === 404
                  ? 'No encontramos este reclamo.'
                  : isConnectionError(error)
                    ? ADMIN_MESSAGES.connection
                    : ADMIN_MESSAGES.unexpected}
            </Alert>
          )}
          <Button
            onClick={() => void evidence.open()}
            loading={evidence.status === 'loading'}
            className="w-full sm:w-auto sm:self-start"
          >
            {evidence.status === 'error' ? 'Intentar de nuevo' : 'Ver evidencia'}
          </Button>
        </Card>
      )}

      {evidence.status === 'success' && evidence.data && (
        <EvidenceContent evidence={evidence.data} />
      )}
    </>
  );
}
