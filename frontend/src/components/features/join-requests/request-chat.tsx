'use client';

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { useImagePreview } from './join-shared';
import { Alert, Button } from '@/components/ui';
import { cx } from '@/components/ui/cx';
import { FieldError } from '@/components/ui/field-parts';
import { useJoinChat, useMessageImage } from '@/hooks/use-join-chat';
import { formatDateTimeLaPaz } from '@/lib/dates';
import { CHAT_IMAGE_TYPES, CHAT_TEXT_MAX, checkChatImage } from '@/lib/receipt-file';
import type { JoinMessage, JoinRequest } from '@/services/join-requests';
import { CHAT_MESSAGES, chatErrorOutcome } from './join-messages';

function firstName(fullName: string): string {
  return fullName.split(' ')[0] ?? fullName;
}

/** Imagen de un mensaje: se pide la URL firmada recién al abrirla (RF-010-08). */
function MessageImage({ requestId, messageId }: { requestId: string; messageId: string }) {
  const { submit, isSubmitting } = useMessageImage(requestId);
  const [url, setUrl] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  async function handleOpen() {
    setProblem(null);
    const result = await submit(messageId);
    if (!result) return;
    if (result.ok) setUrl(result.data.url);
    else {
      const deleted = result.error.code === 'FILE_DELETED' || result.error.statusCode === 410;
      setProblem(deleted ? CHAT_MESSAGES.imageDeleted : CHAT_MESSAGES.imageFailed);
    }
  }

  if (url) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="block">
        {/* eslint-disable-next-line @next/next/no-img-element -- URL firmada de corta duración */}
        <img
          src={url}
          alt="Imagen enviada en el chat"
          referrerPolicy="no-referrer"
          className="max-h-64 max-w-full rounded-field border border-line object-contain"
        />
      </a>
    );
  }
  return (
    <span className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => void handleOpen()}
        disabled={isSubmitting}
        className="inline-flex min-h-11 items-center gap-2 self-start rounded-field border-[1.5px] border-current px-3 font-bold underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-60"
      >
        <svg aria-hidden="true" viewBox="0 0 20 20" className="size-5" fill="currentColor">
          <path d="M3 4h14a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Zm1 2v7.6l3.5-3.5 2.5 2.5 3-3 3 3V6H4Zm9 1.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z" />
        </svg>
        {isSubmitting ? 'Abriendo…' : 'Ver imagen'}
      </button>
      {problem && <span className="text-[15px] font-bold">{problem}</span>}
    </span>
  );
}

function Bubble({
  message,
  mine,
  authorName,
  requestId,
}: {
  message: JoinMessage;
  mine: boolean;
  authorName: string;
  requestId: string;
}) {
  return (
    <li className={cx('flex flex-col gap-1', mine ? 'items-end' : 'items-start')}>
      <div
        className={cx(
          'flex max-w-[85%] flex-col gap-2 rounded-card px-4 py-2.5 sm:max-w-[70%]',
          mine ? 'bg-primary text-white' : 'bg-bg text-ink',
        )}
      >
        {message.imageAvailable && <MessageImage requestId={requestId} messageId={message.id} />}
        {/* Texto plano: React lo pone como nodo de texto (textContent), nunca como HTML. */}
        {message.body && <p className="break-words whitespace-pre-wrap">{message.body}</p>}
      </div>
      <span className="text-[13px] text-muted">
        {mine ? 'Tú' : authorName} ·{' '}
        <time dateTime={message.createdAt}>{formatDateTimeLaPaz(message.createdAt)}</time>
      </span>
    </li>
  );
}

export interface RequestChatProps {
  request: JoinRequest;
  /** Id de la persona con sesión, para alinear sus mensajes. */
  meId: string;
  /** La solicitud cambió en el servidor (por ejemplo, llegó a un estado final). */
  onStale: (message: string) => void;
}

/**
 * Chat de la solicitud en `/solicitudes/[id]` (spec 010 T034, RF-010-05 a RF-010-09; mockups
 * `Solicitud.dc.html` y `SolicitudTitular.dc.html`): burbujas en el orden del servidor, imagen
 * con vista previa, **Enter** para enviar (Mayús+Enter hace un salto de línea), sondeo cada 5 s
 * pausado con la pestaña oculta y marca de leído al abrir. El texto se muestra como texto plano
 * (CA-010-22). Sin `sendMessage` en `allowedActions` queda en solo lectura (CA-010-24).
 */
export function RequestChat({ request, meId, onStale }: RequestChatProps) {
  const titleId = useId();
  const textId = useId();
  const imageInputId = useId();
  const imageErrorId = useId();
  const canSend = request.allowedActions.includes('sendMessage');
  const chat = useJoinChat(request.id, canSend);
  const [text, setText] = useState('');
  const [image, setImage] = useState<File | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const previewUrl = useImagePreview(image);
  const listRef = useRef<HTMLOListElement>(null);
  const isHost = meId === request.host.userId;
  const other = isHost ? request.applicant : request.host;
  const otherFirst = firstName(other.fullName);
  const count = chat.messages.length;

  // Al llegar mensajes nuevos se baja al final de la conversación.
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [count]);

  function handleImage(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    event.target.value = '';
    if (!selected) return;
    const check = checkChatImage(selected);
    if (check) {
      setImageError(check === 'type' ? CHAT_MESSAGES.imageType : CHAT_MESSAGES.imageSize);
      return;
    }
    setImageError(null);
    setImage(selected);
  }

  async function sendCurrent() {
    const trimmed = text.trim();
    if (!trimmed && !image) return;
    if (trimmed.length > CHAT_TEXT_MAX) {
      setFormError(CHAT_MESSAGES.textLength);
      return;
    }
    setFormError(null);
    const result = await chat.send({
      ...(trimmed ? { text: trimmed } : {}),
      ...(image ? { image } : {}),
    });
    if (!result) return;
    if (result.ok) {
      setText('');
      setImage(null);
      return;
    }
    const outcome = chatErrorOutcome(result.error);
    if (outcome.refresh) {
      onStale(outcome.message);
      return;
    }
    if (outcome.field === 'file') setImageError(outcome.message);
    else setFormError(outcome.message);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendCurrent();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void sendCurrent();
    }
  }

  return (
    <section
      aria-labelledby={titleId}
      className="-mx-4 flex min-h-[70vh] flex-col border-y border-line bg-surface sm:mx-0 sm:min-h-0 sm:rounded-card sm:border"
    >
      <div className="flex flex-col gap-0.5 border-b border-line px-4 py-3 sm:px-6">
        <h2 id={titleId} className="font-display text-xl font-bold">
          Chat con {otherFirst}
        </h2>
        <p className="text-[15px] text-muted">{CHAT_MESSAGES.onlyYouTwo}</p>
      </div>

      <div className="flex flex-1 flex-col px-4 py-3 sm:px-6">
        {chat.status === 'loading' || chat.status === 'redirecting' ? (
          <div role="status" aria-busy="true" className="flex flex-col gap-3 py-2">
            <span className="sr-only">Cargando los mensajes…</span>
            <div
              aria-hidden="true"
              className="h-10 w-2/3 animate-pulse rounded-card bg-line motion-reduce:animate-none"
            />
            <div
              aria-hidden="true"
              className="h-10 w-1/2 animate-pulse self-end rounded-card bg-line motion-reduce:animate-none"
            />
          </div>
        ) : chat.status === 'error' ? (
          <Alert
            variant="error"
            title="No pudimos cargar los mensajes."
            action={
              <Button variant="secondary" onClick={chat.reload}>
                Reintentar
              </Button>
            }
          />
        ) : count === 0 ? (
          <p className="py-6 text-center text-muted">
            {isHost ? CHAT_MESSAGES.emptyHost : CHAT_MESSAGES.empty}
          </p>
        ) : (
          <ol
            ref={listRef}
            role="log"
            tabIndex={0}
            aria-live="polite"
            aria-label={`Mensajes con ${otherFirst}`}
            className="flex max-h-[60vh] flex-1 flex-col gap-3 overflow-y-auto py-2"
          >
            {chat.messages.map((message) => (
              <Bubble
                key={message.seq}
                message={message}
                mine={message.senderId === meId}
                authorName={otherFirst}
                requestId={request.id}
              />
            ))}
          </ol>
        )}
        {chat.pollFailed && <p className="text-[15px] text-muted">{CHAT_MESSAGES.pollFailed}</p>}
      </div>

      {canSend ? (
        <form
          noValidate
          onSubmit={handleSubmit}
          className="flex flex-col gap-2 border-t border-line bg-surface px-4 py-3 sm:px-6"
        >
          {image && (
            <div className="flex items-center gap-3">
              {previewUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:)
                <img
                  src={previewUrl}
                  alt="Vista previa de la imagen"
                  className="size-16 rounded-field border border-line object-cover"
                />
              )}
              <span className="min-w-0 flex-1 truncate text-[15px]">{image.name}</span>
              <Button variant="secondary" onClick={() => setImage(null)}>
                Quitar imagen
              </Button>
            </div>
          )}
          {imageError && <FieldError id={imageErrorId}>{imageError}</FieldError>}
          {formError && <Alert variant="error">{formError}</Alert>}
          <div className="flex flex-wrap items-end gap-2">
            <input
              id={imageInputId}
              type="file"
              accept={CHAT_IMAGE_TYPES.join(',')}
              onChange={handleImage}
              aria-describedby={imageError ? imageErrorId : undefined}
              aria-invalid={imageError ? true : undefined}
              className="peer sr-only"
            />
            <label
              htmlFor={imageInputId}
              className="inline-flex size-12 shrink-0 cursor-pointer items-center justify-center rounded-field border-[1.5px] border-field-border bg-surface text-xl peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary"
            >
              <svg aria-hidden="true" viewBox="0 0 20 20" className="size-6" fill="currentColor">
                <path d="M13.5 3a3.5 3.5 0 0 1 2.5 6l-6.3 6.3a2.3 2.3 0 0 1-3.2-3.2L12 6.6l1.1 1.1-5.5 5.5a.8.8 0 0 0 1.1 1.1L15 8a2 2 0 0 0-2.8-2.8l-6.4 6.3a3.3 3.3 0 0 0 4.7 4.7l5-5 1.1 1.1-5 5A4.8 4.8 0 0 1 4.7 10.4L11 4a3.5 3.5 0 0 1 2.5-1Z" />
              </svg>
              <span className="sr-only">Adjuntar imagen</span>
            </label>
            <label htmlFor={textId} className="sr-only">
              Mensaje para {otherFirst}
            </label>
            <textarea
              id={textId}
              rows={1}
              value={text}
              maxLength={CHAT_TEXT_MAX}
              placeholder={`Mensaje para ${otherFirst}`}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={handleKeyDown}
              className="min-h-12 min-w-40 flex-1 resize-none rounded-field border-[1.5px] border-field-border bg-surface px-3 py-2.5 text-body focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-primary"
            />
            <Button type="submit" loading={chat.isSending}>
              Enviar
            </Button>
          </div>
        </form>
      ) : (
        <p className="border-t border-line px-4 py-3 text-[15px] font-bold text-muted sm:px-6">
          {CHAT_MESSAGES.readOnly}
        </p>
      )}
    </section>
  );
}
