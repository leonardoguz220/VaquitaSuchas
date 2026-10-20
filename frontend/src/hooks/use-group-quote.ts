'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { quoteGroup, type QuoteRequest, type QuoteResponse } from '@/services/groups';
import { toApiError, type ApiError } from '@/services/http';
import { useUnauthorizedRedirect } from './use-unauthorized-redirect';

/** Espera tras el último cambio antes de pedir la cotización (plan 001 §6). */
export const QUOTE_DEBOUNCE_MS = 300;

/** `idle`: faltan datos para cotizar. */
export type GroupQuoteState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; quote: QuoteResponse }
  | { status: 'error'; error: ApiError }
  | { status: 'redirecting' };

export interface UseGroupQuoteResult {
  state: GroupQuoteState;
  retry: () => void;
}

function keyOf(input: QuoteRequest | null): string | null {
  if (input === null) return null;
  return [input.priceCents, input.currency, input.exchangeRate ?? '', input.memberCount].join('|');
}

/**
 * Cotización en vivo con `POST /groups/quote`: «Total en Bs» y «Cada miembro pagaría» los
 * calcula el backend. Cada cambio cancela la petición anterior y espera 300 ms.
 */
export function useGroupQuote(input: QuoteRequest | null): UseGroupQuoteResult {
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<{ key: string; state: GroupQuoteState } | null>(null);
  const redirectIfUnauthorized = useUnauthorizedRedirect();
  const redirectRef = useRef(redirectIfUnauthorized);
  const inputRef = useRef(input);
  const baseKey = keyOf(input);
  const key = baseKey === null ? null : `${baseKey}#${attempt}`;

  useEffect(() => {
    redirectRef.current = redirectIfUnauthorized;
    inputRef.current = input;
  });

  useEffect(() => {
    const request = inputRef.current;
    if (key === null || request === null) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      quoteGroup(request, { signal: controller.signal }).then(
        (quote) => {
          if (!controller.signal.aborted) setSettled({ key, state: { status: 'success', quote } });
        },
        (caught: unknown) => {
          if (controller.signal.aborted) return;
          const error = toApiError(caught);
          setSettled({
            key,
            state: redirectRef.current(error)
              ? { status: 'redirecting' }
              : { status: 'error', error },
          });
        },
      );
    }, QUOTE_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [key]);

  const retry = useCallback(() => setAttempt((current) => current + 1), []);

  let state: GroupQuoteState;
  if (key === null) state = { status: 'idle' };
  else if (settled?.key === key) state = settled.state;
  else state = { status: 'loading' };
  return { state, retry };
}
