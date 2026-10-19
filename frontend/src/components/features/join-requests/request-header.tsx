'use client';

import { ServiceLogo } from '@/components/features/catalog/service-logo';
import { Badge } from '@/components/ui';
import { formatBs } from '@/lib/money';
import type { DeadlineKind, JoinRequest } from '@/services/join-requests';
import { ratingText } from './join-messages';
import { JoinStatusBadge } from './join-status-badge';
import { RequestCountdown } from './request-countdown';

/** Quién mira la solicitud: lo decide la API al responder (`host.userId` frente a la sesión). */
export type RequestViewer = 'solicitante' | 'titular';

function firstName(fullName: string): string {
  return fullName.split(' ')[0] ?? fullName;
}

/** Para qué es el plazo vigente, según el `deadlineKind` de la API y quién mira. */
export function deadlineCaption(
  kind: DeadlineKind,
  viewer: RequestViewer,
  request: JoinRequest,
): string {
  const applicant = firstName(request.applicant.fullName);
  switch (kind) {
    case 'solicitud':
      return viewer === 'titular'
        ? 'para enviar los datos de pago'
        : 'para que el titular te envíe los datos de pago';
    case 'pago':
      return viewer === 'titular'
        ? `para que ${applicant} pague y suba su comprobante`
        : 'para pagar y subir tu comprobante';
    case 'decision':
      return viewer === 'titular'
        ? 'para confirmar o rechazar'
        : 'para que el titular confirme tu pago';
  }
}

export interface RequestHeaderProps {
  request: JoinRequest;
  viewer: RequestViewer;
  /** Al llegar a 0 la cuenta regresiva se vuelve a pedir la solicitud. */
  onDeadline: () => void;
}

/**
 * Cabecera de `/solicitudes/[id]` (plan 010 §6; mockups `Solicitud.dc.html` y
 * `SolicitudAbierta.dc.html`): servicio, titular (o solicitante) con su calificación, cuota
 * estimada o fijada, estado con color y texto, y el plazo vigente con cuenta regresiva corregida
 * con `serverNow` (RNF-010-03). Las que llegan de una publicación de cupos llevan la marca
 * «Desde publicación» (spec 008 T019). Todo sale de la API.
 */
export function RequestHeader({ request, viewer, onDeadline }: RequestHeaderProps) {
  const { group, phase } = request;
  const title =
    viewer === 'titular'
      ? `Solicitud de ${request.applicant.fullName}`
      : `Solicitud a ${group.name}`;
  const person =
    viewer === 'titular'
      ? `${request.applicant.fullName}: ${ratingText(request.applicant)}`
      : `Titular: ${request.host.fullName} · ${ratingText(request.host)}`;
  const service = [group.serviceName, group.planName].filter(Boolean).join(' · ');
  return (
    <div className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
      <div className="flex min-w-0 items-start gap-3">
        <ServiceLogo
          name={group.serviceName}
          logoUrl={group.logoUrl}
          brandColor={group.brandColor}
          size="lg"
        />
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="font-display text-2xl leading-tight font-bold tracking-tight sm:text-3xl">
            {title}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <JoinStatusBadge status={phase.status} />
            {request.source === 'publicacion' && (
              <Badge variant="info" icon="info">
                Desde publicación
              </Badge>
            )}
            <span className="text-[15px] text-muted">
              {viewer === 'titular' ? group.name : service}
            </span>
          </div>
          <p className="text-[15px]">{person}</p>
          <p className="text-[15px]">
            {request.quote ? 'Cuota de ingreso fijada: ' : 'Cuota estimada: '}
            <strong>{formatBs(request.quote?.amountCents ?? request.estimatedShareCents)}</strong>
          </p>
        </div>
      </div>
      {phase.deadlineAt && phase.deadlineKind && (
        <div className="flex flex-col rounded-field bg-bg px-4 py-3 sm:items-end sm:text-right">
          <RequestCountdown
            phase={phase}
            onEnd={onDeadline}
            className="font-display text-3xl font-bold"
          />
          <span className="text-[15px] text-muted">
            {deadlineCaption(phase.deadlineKind, viewer, request)}
          </span>
          {request.extended && <span className="text-[15px] text-muted">Plazo ya prorrogado.</span>}
        </div>
      )}
    </div>
  );
}
