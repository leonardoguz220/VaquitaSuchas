'use client';

import Link from 'next/link';
import { useId, useState, type FormEvent } from 'react';
import { Alert, Button, Textarea } from '@/components/ui';
import { useRequestListingSeat } from '@/hooks/use-request-listing-seat';
import { formatDateLaPaz } from '@/lib/dates';
import { requestPath } from '@/lib/routes';
import type { ListingSeatRequest, ListingView } from '@/services/listings';
import { REQUEST_MESSAGE_MAX, REQUEST_MESSAGES, requestErrorText } from './listing-messages';

interface Cause {
  text: string;
  link?: { href: string; label: string };
}

/**
 * Causa por la que no se puede pedir el cupo, con el texto que da la API (`cannotRequestReason`,
 * `entryWindow`, `myRequest`). No decide nada: solo elige el texto de cada causa.
 */
function blockedCause(listing: ListingView): Cause {
  switch (listing.cannotRequestReason) {
    case 'VENTANA_CERRADA':
      return listing.entryWindow.opensAt
        ? { text: REQUEST_MESSAGES.windowOpensOn(formatDateLaPaz(listing.entryWindow.opensAt)) }
        : { text: REQUEST_MESSAGES.windowClosed };
    case 'SOLICITUD_ACTIVA':
      return listing.myRequest
        ? {
            text: REQUEST_MESSAGES.activeRequest,
            link: { href: requestPath(listing.myRequest.id), label: REQUEST_MESSAGES.viewRequest },
          }
        : { text: REQUEST_MESSAGES.activeRequest };
    case 'DEMASIADAS_SOLICITUDES':
      return { text: REQUEST_MESSAGES.tooMany };
    case 'COBROS_ABIERTOS':
      return { text: REQUEST_MESSAGES.openCharges };
    case 'SIN_CUPOS':
      return { text: REQUEST_MESSAGES.noSlots };
    case 'CUENTA_RESTRINGIDA':
      return { text: REQUEST_MESSAGES.accountRestricted };
    default:
      return { text: REQUEST_MESSAGES.notAllowed };
  }
}

/**
 * Pedir un cupo (RF-008-10; mockup `Cupo.dc.html`). Si la API permite pedirlo, abre un formulario
 * con mensaje opcional de hasta 200 caracteres. Si no, el botón va desactivado (`disabled`) con la
 * causa debajo. El contador y el largo son solo ayuda: el servidor valida el mensaje.
 */
export function ListingRequestPanel({
  listing,
  onActivity,
}: {
  listing: ListingView;
  /** Se llama al abrir el formulario y al enviar la solicitud (la pantalla limpia otros avisos). */
  onActivity?: () => void;
}) {
  const headingId = useId();
  const causeId = useId();
  const [formOpen, setFormOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState<ListingSeatRequest | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const { send, isSubmitting } = useRequestListingSeat(listing.id);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = message.trim();
    const outcome = await send(trimmed ? { message: trimmed } : {});
    // `null`: ya había un envío en curso o la sesión venció (ya se redirige).
    if (!outcome) return;
    if (outcome.ok) {
      setSent(outcome.data);
      onActivity?.();
      setErrorText(null);
    } else {
      setErrorText(requestErrorText(outcome.error));
    }
  }

  if (sent) {
    return (
      <section
        aria-labelledby={headingId}
        className="flex flex-col gap-4 border-t border-line pt-6"
      >
        <h2 id={headingId} className="text-lg font-bold">
          {REQUEST_MESSAGES.request}
        </h2>
        <Alert
          variant="success"
          title={REQUEST_MESSAGES.sentTitle}
          action={
            <Button href={requestPath(sent.id)} variant="secondary">
              {REQUEST_MESSAGES.viewRequest}
            </Button>
          }
        >
          {REQUEST_MESSAGES.sentBody}
        </Alert>
      </section>
    );
  }

  if (!listing.canRequest) {
    const cause = blockedCause(listing);
    return (
      <section
        aria-labelledby={headingId}
        className="flex flex-col gap-4 border-t border-line pt-6"
      >
        <h2 id={headingId} className="text-lg font-bold">
          {REQUEST_MESSAGES.request}
        </h2>
        <Button disabled aria-describedby={causeId} className="self-start">
          {REQUEST_MESSAGES.request}
        </Button>
        <p id={causeId} className="text-[15px] text-muted">
          {cause.text}
          {cause.link && (
            <>
              {' '}
              <Link
                href={cause.link.href}
                className="inline-flex min-h-11 items-center font-bold text-primary underline hover:text-primary-hover"
              >
                {cause.link.label}
              </Link>
            </>
          )}
        </p>
      </section>
    );
  }

  if (!formOpen) {
    return (
      <section
        aria-labelledby={headingId}
        className="flex flex-col gap-4 border-t border-line pt-6"
      >
        <h2 id={headingId} className="text-lg font-bold">
          {REQUEST_MESSAGES.request}
        </h2>
        <Button
          onClick={() => {
            setFormOpen(true);
            onActivity?.();
          }}
          className="self-start"
        >
          {REQUEST_MESSAGES.request}
        </Button>
      </section>
    );
  }

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4 border-t border-line pt-6">
      <h2 id={headingId} className="text-lg font-bold">
        {REQUEST_MESSAGES.formTitle}
      </h2>
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <Textarea
          name="message"
          label={REQUEST_MESSAGES.messageLabel}
          hint={`${message.length}/${REQUEST_MESSAGE_MAX}`}
          value={message}
          maxLength={REQUEST_MESSAGE_MAX}
          rows={4}
          disabled={isSubmitting}
          onChange={(event) => setMessage(event.target.value)}
        />
        {errorText && <Alert variant="error">{errorText}</Alert>}
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button type="submit" loading={isSubmitting}>
            {isSubmitting ? REQUEST_MESSAGES.sending : REQUEST_MESSAGES.send}
          </Button>
          <Button variant="secondary" disabled={isSubmitting} onClick={() => setFormOpen(false)}>
            {REQUEST_MESSAGES.cancel}
          </Button>
        </div>
      </form>
    </section>
  );
}
