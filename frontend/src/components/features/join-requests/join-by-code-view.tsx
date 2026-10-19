'use client';

import { useId, useRef, useState, type FormEvent } from 'react';
import { ServiceLogo } from '@/components/features/catalog/ServiceLogo';
import { Alert, Button, Card, Field } from '@/components/ui';
import { useOpenJoinRequest } from '@/hooks/use-join-requests';
import { formatBs } from '@/lib/money';
import { requestPath } from '@/lib/routes';
import type { JoinRequest } from '@/services/join-requests';
import {
  closesAtText,
  HOW_IT_WORKS,
  JOIN_MESSAGES,
  normalizeInviteCode,
  openErrorOutcome,
  ratingText,
} from './join-messages';

const CODE_LENGTH = 8;

function DetailRow({ term, value }: { term: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line py-2.5 last:border-b-0">
      <dt className="text-muted">{term}</dt>
      <dd className="text-right font-bold">{value}</dd>
    </div>
  );
}

/**
 * Lo que ve el solicitante al abrir la solicitud (RF-010-03): servicio, plan, cuota estimada,
 * día de cobro, titular con su calificación y hasta cuándo está abierta la ventana. Sin nombres
 * de miembros ni datos de pago. Todos los valores salen de la respuesta de la API.
 */
function OpenedRequestCard({ request }: { request: JoinRequest }) {
  const titleId = useId();
  const { group } = request;
  const subtitle = [group.serviceName, group.planName, `cobro el día ${group.billingDay}`]
    .filter(Boolean)
    .join(' · ');
  return (
    <Card as="section" aria-labelledby={titleId} className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <ServiceLogo
          name={group.serviceName}
          logoUrl={group.logoUrl}
          brandColor={group.brandColor}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <h2 id={titleId} className="truncate font-display text-xl font-bold">
            {group.name}
          </h2>
          <span className="text-[15px] text-muted">{subtitle}</span>
        </div>
      </div>
      <Alert variant="success" title="Abriste la solicitud.">
        Todavía no eres miembro: conversa con el titular en el chat de la solicitud.
      </Alert>
      <dl className="flex flex-col">
        <DetailRow term="Cuota estimada" value={formatBs(request.estimatedShareCents)} />
        <DetailRow
          term="Titular"
          value={`${request.host.fullName} · ${ratingText(request.host)}`}
        />
      </dl>
      {request.entryWindow.closesAt && (
        <p className="text-[15px]">{closesAtText(request.entryWindow.closesAt)}</p>
      )}
      <p className="text-[15px] text-muted">
        La cuota final la fija el sistema cuando el titular te envía los datos de pago.
      </p>
      <Button href={requestPath(request.id)} className="w-full sm:w-auto sm:self-start">
        Ir a la solicitud y al chat
      </Button>
    </Card>
  );
}

export interface JoinByCodeViewProps {
  /** Código que llega en `?codigo=` del enlace de invitación (spec 005, RF-005-14). */
  initialCode?: string;
}

/**
 * "Unirme con un código" `/unirse` (spec 010 T017, plan §6; mockup `Unirse.dc.html`). El código
 * se escribe en mayúsculas y sin espacios (8 caracteres) y abre una solicitud con
 * `POST /join-requests`: no une a la persona al grupo (RF-010-01). Explica cómo funciona y lo
 * que Vaquita no hace (RF-010-25). Si la ventana está cerrada muestra la fecha de apertura que
 * manda la API (CA-010-37). La validación real del código es del servidor.
 */
export function JoinByCodeView({ initialCode = '' }: JoinByCodeViewProps) {
  const stepsId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState(() => normalizeInviteCode(initialCode));
  const [codeError, setCodeError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [opened, setOpened] = useState<JoinRequest | null>(null);
  const { submit, isSubmitting } = useOpenJoinRequest();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    if (code.length !== CODE_LENGTH) {
      setCodeError(JOIN_MESSAGES.codeLength);
      inputRef.current?.focus();
      return;
    }
    setCodeError(null);
    const result = await submit(code);
    if (!result) return;
    if (result.ok) {
      setOpened(result.data);
      return;
    }
    const outcome = openErrorOutcome(result.error);
    if (outcome.field === 'code') {
      setCodeError(outcome.message);
      inputRef.current?.focus();
    } else {
      setFormError(outcome.message);
    }
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-3xl leading-tight font-bold tracking-tight sm:text-4xl">
          Unirme con un código
        </h1>
        <p className="text-muted">
          El código no te une directamente: abre una solicitud con el titular. Entras cuando él
          confirma tu pago.
        </p>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex flex-col gap-5">
          {opened ? (
            <OpenedRequestCard request={opened} />
          ) : (
            <Card as="section" aria-label="Código de invitación" className="flex flex-col gap-4">
              <form
                noValidate
                onSubmit={(event) => void handleSubmit(event)}
                className="flex flex-col gap-4"
              >
                <Field
                  ref={inputRef}
                  label="Código de invitación (8 caracteres)"
                  hint="Te lo pasa el titular del grupo. Las letras se escriben en mayúsculas."
                  value={code}
                  maxLength={CODE_LENGTH}
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  required
                  error={codeError}
                  onChange={(event) => setCode(normalizeInviteCode(event.target.value))}
                  className="font-mono text-xl tracking-[0.2em] uppercase"
                />
                {formError && <Alert variant="warning">{formError}</Alert>}
                <Button
                  type="submit"
                  loading={isSubmitting}
                  className="w-full sm:w-auto sm:self-start"
                >
                  Abrir solicitud
                </Button>
              </form>
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-5">
          <Card as="section" aria-labelledby={stepsId} className="flex flex-col gap-3">
            <h2 id={stepsId} className="font-display text-xl font-bold">
              Cómo funciona
            </h2>
            <ol className="flex flex-col gap-3">
              {HOW_IT_WORKS.map((step, index) => (
                <li key={step} className="flex gap-3">
                  <span
                    aria-hidden="true"
                    className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-primary-soft font-bold text-primary-hover"
                  >
                    {index + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </Card>
          <p className="rounded-field bg-bg p-4 text-[15px]">{JOIN_MESSAGES.noCustody}</p>
        </div>
      </div>
    </>
  );
}
