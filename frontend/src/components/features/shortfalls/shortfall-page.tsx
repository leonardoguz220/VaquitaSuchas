'use client';

import { useCallback, useState } from 'react';
import { Alert, Badge, Button, Card } from '@/components/ui';
import { useApiResource } from '@/hooks/use-api-resource';
import { useApiSubmit } from '@/hooks/use-api-submit';
import { formatDateTimeLaPaz, formatPeriod } from '@/lib/dates';
import { formatBs } from '@/lib/money';
import { ApiError } from '@/services/http';
import {
  cancelShortfallRound,
  getCurrentShortfall,
  getShortfallPreview,
  openShortfallRound,
  type ShortfallQuote,
  type ShortfallRound,
  type ShortfallRow,
} from '@/services/shortfalls';
import { ROUND_LABEL, shortfallErrorMessage } from './shortfall-labels';
import { ShortfallRowCard } from './shortfall-row-card';

interface ShortfallData {
  round: ShortfallRound | null;
  /** Solo el titular recibe la cotización cuando no hay ronda. */
  quote: ShortfallQuote | null;
}

async function loadShortfall(groupId: string): Promise<ShortfallData> {
  const round = await getCurrentShortfall(groupId);
  if (round) return { round, quote: null };
  try {
    return { round: null, quote: await getShortfallPreview(groupId) };
  } catch (caught) {
    // Un miembro que no es el titular no ve la cotización: solo que no hay ronda.
    if (caught instanceof ApiError && caught.statusCode === 403)
      return { round: null, quote: null };
    throw caught;
  }
}

const openRound = (groupId: string): Promise<ShortfallRound> => openShortfallRound(groupId);
const cancelRound = (roundId: string): Promise<ShortfallRound> => cancelShortfallRound(roundId);

function QuoteCard({
  quote,
  onOpened,
}: {
  quote: ShortfallQuote;
  onOpened: (r: ShortfallRound) => void;
}) {
  const { submit, isSubmitting } = useApiSubmit(openRound);
  const [error, setError] = useState<string | null>(null);

  async function open() {
    setError(null);
    const result = await submit(quote.groupId);
    if (!result) return;
    if (result.ok) onOpened(result.data);
    else setError(shortfallErrorMessage(result.error));
  }

  if (quote.shortfallCents === 0) {
    return (
      <Alert variant="success" title="No falta nada">
        Con los miembros actuales, lo que ya pagaron cubre el servicio de{' '}
        {formatPeriod(quote.period)}.
      </Alert>
    );
  }
  return (
    <Card as="section" aria-labelledby="shortfall-quote" className="flex flex-col gap-4">
      <h2 id="shortfall-quote" className="font-display text-xl font-bold">
        Falta cubrir {formatBs(quote.shortfallCents)}
      </h2>
      <p className="text-[15px] text-muted">
        Si el grupo se queda con {quote.memberCountAfter} miembros, la cuota de{' '}
        {formatPeriod(quote.period)} pasa a {formatBs(quote.baseShareCents)}. Cada miembro que ya
        pagó puede agregar la diferencia o pedir su devolución y salir del grupo.
      </p>
      <ul className="flex flex-col divide-y divide-line">
        {quote.rows.map((row) => (
          <li key={row.userId} className="flex justify-between gap-4 py-2">
            <span>{row.fullName}</span>
            <span className="font-bold">Debe agregar {formatBs(row.extraDueCents)}</span>
          </li>
        ))}
      </ul>
      {error && <Alert variant="error">{error}</Alert>}
      <Button loading={isSubmitting} onClick={() => void open()}>
        Avisar al grupo
      </Button>
      <p className="text-[13px] text-muted">
        Vaquita no guarda ni devuelve dinero: las devoluciones las haces tú y aquí queda el
        registro.
      </p>
    </Card>
  );
}

function RoundView({
  round,
  onRound,
  onStale,
}: {
  round: ShortfallRound;
  onRound: (r: ShortfallRound) => void;
  onStale: () => void;
}) {
  const cancel = useApiSubmit(cancelRound);
  const [error, setError] = useState<string | null>(null);
  const label = ROUND_LABEL[round.status];

  async function cancelIt() {
    setError(null);
    const result = await cancel.submit(round.id);
    if (!result) return;
    if (result.ok) onRound(result.data);
    else setError(shortfallErrorMessage(result.error));
  }

  const replaceRow = (changed: ShortfallRow) =>
    onRound({ ...round, rows: round.rows.map((row) => (row.id === changed.id ? changed : row)) });

  return (
    <div className="flex flex-col gap-4">
      <Card as="section" aria-labelledby="shortfall-round" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="shortfall-round" className="font-display text-xl font-bold">
            Ronda de {formatPeriod(round.period)}
          </h2>
          <Badge variant={label.tone}>{label.text}</Badge>
        </div>
        <p className="text-[15px] text-muted">
          Faltan {formatBs(round.shortfallCents)}. La cuota nueva es{' '}
          {formatBs(round.baseShareCents)} entre {round.memberCountAfter} miembros.
        </p>
        {round.status === 'abierta' && (
          <p className="text-[15px]">
            Responder hasta el {formatDateTimeLaPaz(round.respondBy)}; pagar hasta el{' '}
            {formatDateTimeLaPaz(round.payBy)}. Quien no responda a tiempo pasa a devolución.
          </p>
        )}
        {error && <Alert variant="error">{error}</Alert>}
        {round.allowedActions.includes('cancel') && (
          <Button variant="secondary" loading={cancel.isSubmitting} onClick={() => void cancelIt()}>
            Cancelar la ronda
          </Button>
        )}
      </Card>
      {round.rows.map((row) => (
        <ShortfallRowCard key={row.id} row={row} onChanged={replaceRow} onStale={onStale} />
      ))}
    </div>
  );
}

/**
 * `/grupos/[id]/faltante` (spec 011): el titular cotiza y avisa al grupo; cada miembro afectado
 * elige cubrir su parte o pedir su devolución. Todo monto y estado viene de la API.
 */
export function ShortfallPageView({ groupId }: { groupId: string }) {
  const load = useCallback(() => loadShortfall(groupId), [groupId]);
  const { status, data, error, reload, refresh } = useApiResource<ShortfallData>(load);
  const [override, setOverride] = useState<ShortfallRound | null>(null);

  if (status === 'loading' || status === 'redirecting') {
    return <p role="status">Cargando…</p>;
  }
  if (status === 'error' || !data) {
    const notFound = error?.statusCode === 404;
    return (
      <Alert variant="error" action={!notFound && <Button onClick={reload}>Reintentar</Button>}>
        {notFound ? 'No encontramos este grupo.' : 'No pudimos cargar el faltante del grupo.'}
      </Alert>
    );
  }

  const round = override ?? data.round;
  const quote = data.quote;
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6">
      <h1 className="font-display text-2xl font-bold">Faltante del grupo</h1>
      {round ? (
        <RoundView
          round={round}
          onRound={setOverride}
          onStale={() => {
            setOverride(null);
            void refresh();
          }}
        />
      ) : quote ? (
        <QuoteCard quote={quote} onOpened={setOverride} />
      ) : (
        <Alert variant="info">No hay una ronda de faltante en este grupo.</Alert>
      )}
    </main>
  );
}
