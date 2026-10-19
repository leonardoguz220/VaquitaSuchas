import { useId } from 'react';
import { Alert, Button, Card } from '@/components/ui';
import type { OutboxState } from '@/hooks/use-dev-telegram';

export interface TelegramOutboxProps {
  state: OutboxState;
  onRefresh: () => void;
}

function isEmpty(data: unknown): boolean {
  return data === null || data === undefined || (Array.isArray(data) && data.length === 0);
}

/**
 * Bandeja del bot simulado (`GET /dev/telegram/outbox`). La forma de la respuesta aún no está
 * fijada en el contrato ("texto y botones"), así que se muestra el JSON tal cual; se mostrará
 * con formato cuando backend la fije (spec 000, T030 [BE]).
 */
export function TelegramOutbox({ state, onRefresh }: TelegramOutboxProps) {
  const titleId = useId();
  return (
    <Card as="section" aria-labelledby={titleId} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={titleId} className="font-display text-xl font-bold">
          Bandeja del bot
        </h2>
        <Button variant="secondary" onClick={onRefresh} loading={state.kind === 'loading'}>
          Actualizar
        </Button>
      </div>
      <div aria-live="polite">
        {state.kind === 'idle' && (
          <p className="text-muted">Toca Actualizar para ver los mensajes que envió el bot.</p>
        )}
        {state.kind === 'loading' && <p className="text-muted">Cargando la bandeja…</p>}
        {state.kind === 'error' && (
          <Alert variant="error">
            No se pudo cargar la bandeja ({state.error.code}, {state.error.statusCode}).
          </Alert>
        )}
        {state.kind === 'data' && isEmpty(state.data) && (
          <p className="text-muted">La bandeja está vacía.</p>
        )}
        {state.kind === 'data' && !isEmpty(state.data) && (
          <pre
            aria-label="Mensajes del bot"
            className="max-h-96 overflow-auto rounded-field border border-line bg-bg p-4 text-sm whitespace-pre-wrap"
          >
            {JSON.stringify(state.data, null, 2)}
          </pre>
        )}
      </div>
    </Card>
  );
}
