'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useState, type FormEvent } from 'react';
import { openErrorOutcome } from '@/components/features/join-requests/join-messages';
import { Alert, Button, Card, Textarea } from '@/components/ui';
import { useRequestListingSeat } from '@/hooks/use-listings';
import { requestPath } from '@/lib/routes';
import { LISTING_MESSAGE_MAX, type ListingView } from '@/services/listings';
import { cannotRequestText, firstName } from './listing-messages';

/** Error de `POST /listings/:id/requests`: los de la spec 010 más los propios de la publicación. */
function requestErrorText(error: Parameters<typeof openErrorOutcome>[0]): {
  field: boolean;
  message: string;
} {
  if (error.code === 'VALIDATION_ERROR' || error.statusCode === 400) {
    return { field: true, message: `Escribe hasta ${LISTING_MESSAGE_MAX} caracteres.` };
  }
  if (error.code === 'LISTING_NOT_FOUND' || error.statusCode === 404) {
    return { field: false, message: 'Esta publicación ya no está activa.' };
  }
  return { field: false, message: openErrorOutcome(error).message };
}

function Disabled({ listing }: { listing: ListingView }) {
  const reasonId = useId();
  return (
    <>
      <p id={reasonId} className="rounded-field bg-bg p-3">
        {cannotRequestText(listing.cannotRequestReason, listing.entryWindow)}
      </p>
      {listing.myRequest && (
        <Link
          href={requestPath(listing.myRequest.id)}
          className="inline-flex min-h-11 items-center self-start rounded-field font-bold underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          Ver mi solicitud
        </Link>
      )}
      <Button disabled aria-describedby={reasonId} className="w-full">
        Solicitar cupo
      </Button>
    </>
  );
}

/**
 * **Solicitar un cupo** en `/cupos/[id]` (spec 008 T019, plan §6; mockup `Cupo.dc.html`): mensaje
 * opcional para el titular con contador de 200 y botón que se desactiva al enviar para no
 * duplicar. Si la API dice que no se puede (`canRequest: false`), el botón queda deshabilitado
 * con la causa de `cannotRequestReason` y, si ya hay una solicitud, el enlace a ella. Al abrirla
 * lleva a `/solicitudes/[id]` (spec 010).
 */
export function ListingRequestCard({ listing }: { listing: ListingView }) {
  const titleId = useId();
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const { submit, isSubmitting } = useRequestListingSeat(listing.id);
  const owner = firstName(listing.owner.fullName);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = message.trim();
    if (trimmed.length > LISTING_MESSAGE_MAX) {
      setFieldError(`Escribe hasta ${LISTING_MESSAGE_MAX} caracteres.`);
      return;
    }
    setFieldError(null);
    setFormError(null);
    const result = await submit(trimmed);
    if (!result) return;
    if (result.ok) {
      setSent(true);
      router.push(requestPath(result.data.id));
      return;
    }
    const outcome = requestErrorText(result.error);
    if (outcome.field) setFieldError(outcome.message);
    else setFormError(outcome.message);
  }

  return (
    <Card as="section" aria-labelledby={titleId} className="flex flex-col gap-4">
      <h2 id={titleId} className="font-display text-xl font-bold">
        Solicitar un cupo
      </h2>
      {listing.canRequest ? (
        <form
          noValidate
          onSubmit={(event) => void handleSubmit(event)}
          className="flex flex-col gap-4"
        >
          <Textarea
            label={`Mensaje para ${owner} (opcional)`}
            hint={`${message.length} / ${LISTING_MESSAGE_MAX}`}
            value={message}
            maxLength={LISTING_MESSAGE_MAX}
            error={fieldError}
            disabled={sent}
            onChange={(event) => setMessage(event.target.value)}
          />
          {formError && <Alert variant="error">{formError}</Alert>}
          {sent && <Alert variant="success">Abrimos tu solicitud. Te llevamos a ella…</Alert>}
          <Button type="submit" loading={isSubmitting} disabled={sent} className="w-full">
            Solicitar cupo
          </Button>
          <p className="text-[15px] text-muted">
            Se abre una solicitud con chat, como con un código. Si te aceptan, se cancelan tus otras
            solicitudes abiertas a {listing.service.name}.
          </p>
        </form>
      ) : (
        <Disabled listing={listing} />
      )}
      <p className="text-[15px] text-muted">Vaquita no custodia el dinero ni lo devuelve.</p>
    </Card>
  );
}
