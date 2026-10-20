'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toApiError, type ApiError } from '@/services/http';
import {
  getMessageImage,
  listMessages,
  markMessagesRead,
  sendMessage,
  type JoinMessage,
  type SendMessageRequest,
} from '@/services/join-requests';
import { useApiSubmit } from './use-api-submit';
import { useUnauthorizedRedirect } from './use-unauthorized-redirect';

/** Cada cuánto se piden los mensajes nuevos con la conversación abierta (plan 010 §6, R3). */
export const CHAT_POLL_MS = 5000;

/** Mensajes por página (`limit` de 1 a 100). */
const PAGE_SIZE = 100;

/** Tope de páginas en la carga inicial, por si la API devolviera siempre páginas llenas. */
const MAX_INITIAL_PAGES = 20;

export type ChatStatus = 'loading' | 'success' | 'error' | 'redirecting';

interface ChatState {
  status: ChatStatus;
  messages: JoinMessage[];
  error: ApiError | null;
}

function isHidden(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden';
}

function maxSeq(messages: JoinMessage[]): number {
  return messages.reduce((max, message) => Math.max(max, message.seq), 0);
}

/** Une mensajes sin repetir (por `seq`) y en el orden del servidor. */
function mergeMessages(current: JoinMessage[], incoming: JoinMessage[]): JoinMessage[] {
  const bySeq = new Map(current.map((message) => [message.seq, message]));
  for (const message of incoming) bySeq.set(message.seq, message);
  return [...bySeq.values()].sort((a, b) => a.seq - b.seq);
}

async function loadAllMessages(requestId: string): Promise<JoinMessage[]> {
  const all: JoinMessage[] = [];
  let afterSeq: number | undefined;
  for (let page = 0; page < MAX_INITIAL_PAGES; page += 1) {
    const result = await listMessages(requestId, {
      ...(afterSeq !== undefined ? { afterSeq } : {}),
      limit: PAGE_SIZE,
    });
    all.push(...result.items);
    if (result.items.length < PAGE_SIZE) break;
    afterSeq = maxSeq(result.items);
  }
  return all;
}

/**
 * Chat de una solicitud (RF-010-05 a RF-010-09; plan 010 §6 y `research.md` R3): carga los
 * mensajes, consulta los nuevos cada 5 s con `afterSeq` mientras `live` sea `true` y la pestaña
 * esté visible (se pausa con la pestaña oculta y vuelve a consultar al mostrarse) y marca como
 * leído hasta el último `seq` visto. El orden lo da el `seq` del servidor. Un `401` lleva a
 * `/ingresar`; si falla un sondeo se avisa con `pollFailed` y se sigue intentando.
 */
export function useJoinChat(requestId: string, live: boolean) {
  const [state, setState] = useState<ChatState>({ status: 'loading', messages: [], error: null });
  const [attempt, setAttempt] = useState(0);
  const [pollFailed, setPollFailed] = useState(false);
  const lastSeqRef = useRef(0);
  const readSeqRef = useRef(0);
  const redirectIfUnauthorized = useUnauthorizedRedirect();
  const redirectRef = useRef(redirectIfUnauthorized);

  useEffect(() => {
    redirectRef.current = redirectIfUnauthorized;
  }, [redirectIfUnauthorized]);

  const markReadUpTo = useCallback(
    (seq: number) => {
      if (seq <= readSeqRef.current || isHidden()) return;
      const previous = readSeqRef.current;
      readSeqRef.current = seq;
      markMessagesRead(requestId, seq).catch(() => {
        // Se volverá a marcar con el próximo mensaje o al volver a la pestaña.
        readSeqRef.current = previous;
      });
    },
    [requestId],
  );

  const addMessages = useCallback((incoming: JoinMessage[]) => {
    if (incoming.length === 0) return;
    lastSeqRef.current = Math.max(lastSeqRef.current, maxSeq(incoming));
    setState((current) => ({
      ...current,
      messages: mergeMessages(current.messages, incoming),
    }));
  }, []);

  // Carga inicial (y cada "Reintentar").
  useEffect(() => {
    let active = true;
    loadAllMessages(requestId).then(
      (messages) => {
        if (!active) return;
        lastSeqRef.current = maxSeq(messages);
        setState({ status: 'success', messages: mergeMessages([], messages), error: null });
        markReadUpTo(lastSeqRef.current);
      },
      (caught: unknown) => {
        if (!active) return;
        const error = toApiError(caught);
        const redirecting = redirectRef.current(error);
        setState({ status: redirecting ? 'redirecting' : 'error', messages: [], error });
      },
    );
    return () => {
      active = false;
    };
  }, [requestId, attempt, markReadUpTo]);

  // Sondeo de mensajes nuevos.
  const loaded = state.status === 'success';
  useEffect(() => {
    if (!live || !loaded) return;
    let cancelled = false;
    let inFlight = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const poll = () => {
      if (inFlight || isHidden()) return;
      inFlight = true;
      listMessages(requestId, { afterSeq: lastSeqRef.current, limit: PAGE_SIZE })
        .then(
          (page) => {
            if (cancelled) return;
            setPollFailed(false);
            addMessages(page.items);
            markReadUpTo(lastSeqRef.current);
          },
          (caught: unknown) => {
            if (cancelled) return;
            if (!redirectRef.current(toApiError(caught))) setPollFailed(true);
          },
        )
        .finally(() => {
          inFlight = false;
        });
    };
    const start = () => {
      if (timer === null) timer = setInterval(poll, CHAT_POLL_MS);
    };
    const stop = () => {
      if (timer !== null) clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => {
      if (isHidden()) {
        stop();
        return;
      }
      markReadUpTo(lastSeqRef.current);
      poll();
      start();
    };

    if (!isHidden()) start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [live, loaded, requestId, addMessages, markReadUpTo]);

  const sendRequest = useCallback(
    (input: SendMessageRequest) => sendMessage(requestId, input),
    [requestId],
  );
  const sender = useApiSubmit(sendRequest);
  const { submit: submitMessage } = sender;

  /** Envía un mensaje y lo agrega a la conversación con la respuesta de la API. */
  const send = useCallback(
    async (input: SendMessageRequest) => {
      const result = await submitMessage(input);
      if (result?.ok) {
        addMessages([result.data]);
        markReadUpTo(result.data.seq);
      }
      return result;
    },
    [submitMessage, addMessages, markReadUpTo],
  );

  /** Vuelve a cargar la conversación (botón "Reintentar"). */
  const reload = useCallback(() => {
    setState({ status: 'loading', messages: [], error: null });
    setAttempt((current) => current + 1);
  }, []);

  return { ...state, pollFailed, reload, send, isSending: sender.isSubmitting };
}

/** URL firmada de la imagen de un mensaje, pedida al abrirla (RF-010-08). */
export function useMessageImage(requestId: string) {
  const request = useCallback(
    (messageId: string) => getMessageImage(requestId, messageId),
    [requestId],
  );
  return useApiSubmit(request);
}
