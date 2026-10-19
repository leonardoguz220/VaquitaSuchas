'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { Alert, Button } from '@/components/ui';
import { useJoinRequest, useExtendJoinRequest } from '@/hooks/use-join-requests';
import { useMe } from '@/hooks/use-me';
import { chargePath, groupPath, REQUESTS_PATH } from '@/lib/routes';
import { FINAL_JOIN_STATUSES, type JoinRequest } from '@/services/join-requests';
import {
  actionErrorOutcome,
  finalReasonText,
  joinErrorMessage,
  REQUEST_MESSAGES,
} from './join-messages';
import { PaymentInfoCard } from './payment-info-card';
import { PROOF_SECTION_ID, ProofUpload } from './proof-upload';
import { ProofSummary } from './proof-summary';
import { RequestChat } from './request-chat';
import { DecisionActions, hasDecisionActions, HostCheckBank } from './request-decisions';
import { RequestHeader, type RequestViewer } from './request-header';
import { RequestTimeline } from './request-timeline';
import { SendPaymentDataModal } from './send-payment-data-modal';

type Notice = { variant: 'success' | 'warning' | 'error'; text: string };

function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-11 items-center gap-1 self-start rounded-field font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <span aria-hidden="true">←</span> {label}
    </Link>
  );
}

function DetailSkeleton() {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-5">
      <span className="sr-only">Cargando la solicitud…</span>
      <div
        aria-hidden="true"
        className="h-32 animate-pulse rounded-card border border-line bg-surface motion-reduce:animate-none"
      />
      <div
        aria-hidden="true"
        className="h-64 animate-pulse rounded-card border border-line bg-surface motion-reduce:animate-none"
      />
    </div>
  );
}

/** Motivo del rechazo y por qué terminó la solicitud, tal como los entrega la API. */
function FinalNotes({ request }: { request: JoinRequest }) {
  if (!FINAL_JOIN_STATUSES.includes(request.phase.status)) return null;
  const reason = finalReasonText(request.finalReason);
  if (request.phase.status === 'rechazada' && request.rejectReason) {
    return (
      <Alert variant="warning" title="El titular rechazó la solicitud.">
        <p className="break-words">Motivo: {request.rejectReason}</p>
        {request.rejectedAsFalse && <p>Marcó el comprobante como falso.</p>}
      </Alert>
    );
  }
  if (!reason) return null;
  return (
    <Alert variant={request.phase.status === 'aceptada' ? 'success' : 'info'}>
      <p>{reason}</p>
      {request.chargeId && (
        <Link
          href={chargePath(request.chargeId)}
          className="inline-flex min-h-11 items-center font-bold underline underline-offset-2"
        >
          Ver el cobro de ingreso
        </Link>
      )}
    </Alert>
  );
}

/**
 * Barra de acciones (plan 010 §6): fija en la parte inferior del celular y en línea en pantallas
 * anchas. Solo se muestra si la API ofrece alguna acción.
 */
function ActionBar({ children }: { children: ReactNode }) {
  return (
    <div
      role="group"
      aria-label="Acciones de la solicitud"
      className="fixed inset-x-0 bottom-0 z-20 flex flex-wrap gap-2 border-t border-line bg-surface px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] sm:static sm:rounded-card sm:border sm:p-4 sm:shadow-none [&>*]:flex-1 sm:[&>*]:flex-none"
    >
      {children}
    </div>
  );
}

export interface RequestDetailViewProps {
  requestId: string;
}

/**
 * Detalle de la solicitud `/solicitudes/[id]` (spec 010 T022, plan §6; mockups `Solicitud`,
 * `SolicitudAbierta` y `SolicitudTitular`): cabecera con cuenta regresiva corregida con
 * `serverNow`, datos de pago y acciones según `allowedActions` (el titular envía los datos de pago
 * o prorroga; el solicitante sube su comprobante, T026; confirmar, efectivo, rechazar y cancelar,
 * T030) y el chat con la otra parte (T034). Al llegar a 0 el plazo se vuelve a
 * pedir la solicitud: el estado lo decide el servidor. `403` (miembro que no participa) y `404` (ajeno) muestran su aviso (CA-010-20).
 */
export function RequestDetailView({ requestId }: RequestDetailViewProps) {
  const me = useMe();
  const { status, data: request, error, reload, refresh, replace } = useJoinRequest(requestId);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const extend = useExtendJoinRequest(requestId);

  if (status === 'error' && error) {
    return (
      <>
        <BackLink href={REQUESTS_PATH} label="Volver a mis solicitudes" />
        {error.statusCode === 404 && (
          <Alert variant="warning" title="No encontramos esta solicitud.">
            Puede que no exista o que no sea tuya.
          </Alert>
        )}
        {error.statusCode === 403 && (
          <Alert variant="warning" title="Esta solicitud no es tuya.">
            Solo la ven la persona que la abrió y el titular del grupo.
          </Alert>
        )}
        {error.statusCode !== 404 && error.statusCode !== 403 && (
          <Alert
            variant="error"
            title="No pudimos cargar la solicitud."
            action={
              <Button variant="secondary" onClick={reload}>
                Reintentar
              </Button>
            }
          >
            {joinErrorMessage(error)}
          </Alert>
        )}
      </>
    );
  }

  if (me.status === 'error' && me.error) {
    return (
      <>
        <BackLink href={REQUESTS_PATH} label="Volver a mis solicitudes" />
        <Alert
          variant="error"
          title="No pudimos cargar la solicitud."
          action={
            <Button variant="secondary" onClick={me.reload}>
              Reintentar
            </Button>
          }
        >
          {joinErrorMessage(me.error)}
        </Alert>
      </>
    );
  }

  if (!request || !me.user) {
    return (
      <>
        <BackLink href={REQUESTS_PATH} label="Volver a mis solicitudes" />
        <DetailSkeleton />
      </>
    );
  }

  const viewer: RequestViewer = me.user.id === request.host.userId ? 'titular' : 'solicitante';
  const can = (action: JoinRequest['allowedActions'][number]) =>
    request.allowedActions.includes(action);

  function handleChanged(updated: JoinRequest, message: string) {
    replace(updated);
    setNotice({ variant: 'success', text: message });
  }

  function handleStale(message: string) {
    setNotice({ variant: 'warning', text: message });
    void refresh();
  }

  async function handleExtend(current: JoinRequest) {
    setNotice(null);
    const result = await extend.submit({ version: current.version });
    if (!result) return;
    if (result.ok) {
      handleChanged(result.data, REQUEST_MESSAGES.extended);
      return;
    }
    const outcome = actionErrorOutcome(result.error);
    if (outcome.refresh) handleStale(outcome.message);
    else setNotice({ variant: 'error', text: outcome.message });
  }

  const actions: ReactNode[] = [];
  if (can('uploadProof')) {
    actions.push(
      <Button key="proof" href={`#${PROOF_SECTION_ID}`}>
        Subir comprobante
      </Button>,
    );
  }
  if (can('sendPaymentData')) {
    actions.push(
      <Button key="payment" onClick={() => setPaymentOpen(true)}>
        Enviar datos de pago
      </Button>,
    );
  }
  if (can('extend')) {
    actions.push(
      <Button
        key="extend"
        variant="secondary"
        loading={extend.isSubmitting}
        onClick={() => void handleExtend(request)}
      >
        Prorrogar 15 min
      </Button>,
    );
  }

  if (hasDecisionActions(request)) {
    actions.push(
      <DecisionActions
        key="decisions"
        request={request}
        onChanged={handleChanged}
        onStale={handleStale}
      />,
    );
  }

  return (
    <div className="flex flex-col gap-5 pb-28 sm:pb-0">
      {viewer === 'titular' ? (
        <BackLink href={groupPath(request.group.id)} label={`Volver a ${request.group.name}`} />
      ) : (
        <BackLink href={REQUESTS_PATH} label="Volver a mis solicitudes" />
      )}
      {notice && (
        <Alert variant={notice.variant} aria-live="polite">
          {notice.text}
        </Alert>
      )}
      <RequestHeader request={request} viewer={viewer} onDeadline={() => void refresh()} />
      <FinalNotes request={request} />
      {can('extend') && (
        <p className="text-[15px] text-muted">
          La prórroga sirve si el banco demora: suma 15 minutos al plazo de pago, una sola vez.
        </p>
      )}
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex flex-col gap-5">
          <PaymentInfoCard request={request} viewer={viewer} />
          {can('uploadProof') && (
            <ProofUpload
              request={request}
              onUploaded={(updated) => handleChanged(updated, REQUEST_MESSAGES.proofSent)}
              onStale={handleStale}
            />
          )}
          {request.proof && <ProofSummary proof={request.proof} />}
          {viewer === 'titular' && <HostCheckBank request={request} />}
          <p className="rounded-field bg-bg p-4 text-[15px]">
            {viewer === 'titular'
              ? REQUEST_MESSAGES.noCustodyHost
              : REQUEST_MESSAGES.noCustodyApplicant}
          </p>
          <RequestChat request={request} meId={me.user.id} onStale={handleStale} />
        </div>
        <div className="flex flex-col gap-5">
          <RequestTimeline events={request.timeline} />
        </div>
      </div>
      {actions.length > 0 && <ActionBar>{actions}</ActionBar>}
      {can('sendPaymentData') && (
        <SendPaymentDataModal
          request={request}
          open={paymentOpen}
          onClose={() => setPaymentOpen(false)}
          onSent={(updated) => {
            setPaymentOpen(false);
            handleChanged(updated, REQUEST_MESSAGES.paymentDataSent);
          }}
          onStale={(message) => {
            setPaymentOpen(false);
            handleStale(message);
          }}
        />
      )}
    </div>
  );
}
