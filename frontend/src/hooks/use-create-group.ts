'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createGroup,
  getHostEligibility,
  quoteGroup,
  updatePaymentInfo,
  type CreateGroupRequest,
  type GroupDetail,
  type QuoteRequest,
  type QuoteResponse,
} from '@/services/groups';
import { toApiError, type ApiError } from '@/services/http';
import { useApiResource } from './use-api-resource';
import { useApiSubmit } from './use-api-submit';
import { useUnauthorizedRedirect } from './use-unauthorized-redirect';

/** Habilitación como titular de la persona con sesión (`GET /users/me/host-eligibility`). */
export function useHostEligibility() {
  return useApiResource(getHostEligibility);
}

/** Retraso antes de pedir la cotización mientras la persona escribe (plan 001 §6). */
export const QUOTE_DEBOUNCE_MS = 300;

export type QuoteStatus = 'idle' | 'loading' | 'success' | 'error';

interface QuoteResult {
  key: string;
  attempt: number;
  quote: QuoteResponse | null;
  error: ApiError | null;
}

/**
 * Cotización en vivo de "Total en Bs" y "Cada miembro pagaría" (`POST /groups/quote`): el
 * frontend no calcula. Pide 300 ms después del último cambio y descarta respuestas viejas.
 * Con `input = null` (faltan datos) queda en `idle`.
 */
export function useGroupQuote(input: QuoteRequest | null) {
  const key = input ? JSON.stringify(input) : null;
  const [result, setResult] = useState<QuoteResult | null>(null);
  const [attempt, setAttempt] = useState(0);
  const redirectIfUnauthorized = useUnauthorizedRedirect();
  const redirectRef = useRef(redirectIfUnauthorized);

  useEffect(() => {
    redirectRef.current = redirectIfUnauthorized;
  }, [redirectIfUnauthorized]);

  useEffect(() => {
    if (!key) return;
    let active = true;
    const timer = setTimeout(() => {
      quoteGroup(JSON.parse(key) as QuoteRequest).then(
        (quote) => {
          if (active) setResult({ key, attempt, quote, error: null });
        },
        (caught: unknown) => {
          if (!active) return;
          const error = toApiError(caught);
          if (!redirectRef.current(error)) setResult({ key, attempt, quote: null, error });
        },
      );
    }, QUOTE_DEBOUNCE_MS);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [key, attempt]);

  const current = result && result.key === key && result.attempt === attempt ? result : null;
  let status: QuoteStatus = 'loading';
  if (!key) status = 'idle';
  else if (current) status = current.error ? 'error' : 'success';

  /** Vuelve a pedir la cotización (botón "Reintentar"). */
  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  return {
    status,
    quote: current?.quote ?? null,
    error: current?.error ?? null,
    retry,
  };
}

export interface CreateGroupInput {
  group: CreateGroupRequest;
  /** Imagen del QR de pago elegida en el formulario; se sube después de crear (contrato 001). */
  qr: File | null;
}

export interface CreateGroupOutcome {
  group: GroupDetail;
  /** Error al subir el QR: el grupo ya quedó creado y el QR se puede subir desde Ajustes. */
  qrError: ApiError | null;
}

async function createWithQr({ group, qr }: CreateGroupInput): Promise<CreateGroupOutcome> {
  const created = await createGroup(group);
  if (!qr) return { group: created, qrError: null };
  try {
    await updatePaymentInfo(created.id, { qr });
    return { group: created, qrError: null };
  } catch (caught) {
    return { group: created, qrError: toApiError(caught) };
  }
}

/**
 * Crear la suscripción: `POST /groups` y, si hay QR, `PUT /groups/:id/payment-info`. Mismo
 * patrón que `useApiSubmit`: `null` si ya había un envío o llegó un `401`.
 */
export function useCreateGroup() {
  return useApiSubmit(createWithQr);
}
