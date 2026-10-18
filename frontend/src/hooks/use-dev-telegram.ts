'use client';

import { useCallback, useRef, useState } from 'react';
import {
  getTelegramOutbox,
  simulateTelegram,
  type TelegramSimulateRequest,
} from '@/services/dev-telegram';
import { toApiError, type ApiError } from '@/services/http';

export type SimulateResult = { ok: true } | { ok: false; error: ApiError };

/** Estado de la bandeja del bot. `data` se muestra tal cual (forma aún sin fijar, T030 [BE]). */
export type OutboxState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'data'; data: unknown }
  | { kind: 'error'; error: ApiError };

/**
 * Estado de la pantalla `/dev/telegram` (solo con `NEXT_PUBLIC_TELEGRAM_MODE=dev`): envía
 * mensajes simulados al bot y lee su bandeja. Ignora un envío mientras otro está en curso.
 */
export function useDevTelegram() {
  const [sending, setSending] = useState<TelegramSimulateRequest['kind'] | null>(null);
  const [outbox, setOutbox] = useState<OutboxState>({ kind: 'idle' });
  const sendingRef = useRef(false);

  const simulate = useCallback(
    async (body: TelegramSimulateRequest): Promise<SimulateResult | null> => {
      if (sendingRef.current) return null;
      sendingRef.current = true;
      setSending(body.kind);
      try {
        await simulateTelegram(body);
        return { ok: true };
      } catch (caught) {
        return { ok: false, error: toApiError(caught) };
      } finally {
        sendingRef.current = false;
        setSending(null);
      }
    },
    [],
  );

  const loadOutbox = useCallback(async (telegramUserId: number) => {
    setOutbox({ kind: 'loading' });
    try {
      setOutbox({ kind: 'data', data: await getTelegramOutbox(telegramUserId) });
    } catch (caught) {
      setOutbox({ kind: 'error', error: toApiError(caught) });
    }
  }, []);

  return { simulate, sending, outbox, loadOutbox };
}
