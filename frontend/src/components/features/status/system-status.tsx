'use client';

import type { ReactNode } from 'react';
import { Alert, Badge, Button, Card, type BadgeTone } from '@/components/ui';
import { useHealth, type HealthState } from '@/hooks/use-health';
import { formatDateTimeLaPaz } from '@/lib/dates';
import type { HealthResponse } from '@/services/health';

/** Los tres estados que muestra cada tarjeta (plan 000 §6). */
export type ComponentStatus = 'ok' | 'degradado' | 'sin_respuesta';

const statusLabel: Record<ComponentStatus, string> = {
  ok: 'OK',
  degradado: 'Degradado',
  sin_respuesta: 'Sin respuesta',
};

const statusTone: Record<ComponentStatus, BadgeTone> = {
  ok: 'success',
  degradado: 'warning',
  sin_respuesta: 'danger',
};

export const UNREACHABLE_MESSAGE = 'No se pudo contactar con el servidor.';

interface CardView {
  status: ComponentStatus;
  description: ReactNode;
}

/** Tarjeta del backend: refleja `status` tal como lo entrega `GET /health`. */
function backendCard(data: HealthResponse | null): CardView {
  if (!data) {
    return {
      status: 'sin_respuesta',
      description: 'No respondió en 5 segundos o la conexión falló.',
    };
  }
  const version = `Versión ${data.version}.`;
  return data.status === 'ok'
    ? { status: 'ok', description: `Respondió a la consulta de salud. ${version}` }
    : { status: 'degradado', description: `Responde, pero sin base de datos. ${version}` };
}

/**
 * Tarjeta de la base de datos. Si la base está `down`, el backend avisa que `SELECT 1` no
 * respondió (`latencyMs: null`): se muestra «Sin respuesta», y «Degradado» queda para el
 * backend, que sigue en pie sin ella. Sin respuesta del backend no se sabe nada de la base.
 */
function databaseCard(data: HealthResponse | null): CardView {
  if (!data) {
    return {
      status: 'sin_respuesta',
      description: 'No se puede consultar sin respuesta del backend.',
    };
  }
  if (data.database.status === 'up') {
    return {
      status: 'ok',
      description:
        data.database.latencyMs === null
          ? 'Respondió a la consulta de prueba.'
          : `Respondió en ${data.database.latencyMs} ms.`,
    };
  }
  return { status: 'sin_respuesta', description: 'No respondió a la consulta de prueba.' };
}

function StatusCard({ id, title, view }: { id: string; title: string; view: CardView }) {
  const headingId = `estado-${id}`;
  return (
    <Card as="section" aria-labelledby={headingId} className="flex w-full flex-col gap-3">
      <h2 id={headingId} className="font-display text-xl leading-tight font-bold">
        {title}
      </h2>
      <Badge variant={statusTone[view.status]} className="self-start">
        {statusLabel[view.status]}
      </Badge>
      <p className="text-muted">{view.description}</p>
    </Card>
  );
}

function StatusSkeleton() {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">Consultando el estado del sistema…</span>
      <ul aria-hidden="true" className="grid gap-4 md:grid-cols-3">
        {[0, 1, 2].map((card) => (
          <li
            key={card}
            data-testid="status-skeleton-card"
            className="flex flex-col gap-3 rounded-card border border-line bg-surface p-5 sm:p-6"
          >
            <div className="h-6 w-32 animate-pulse rounded-field bg-line motion-reduce:animate-none" />
            <div className="h-7 w-24 animate-pulse rounded-full bg-line motion-reduce:animate-none" />
            <div className="h-5 w-full animate-pulse rounded-field bg-line motion-reduce:animate-none" />
          </li>
        ))}
      </ul>
    </div>
  );
}

function StatusCards({ data }: { data: HealthResponse | null }) {
  const frontend: CardView = {
    status: 'ok',
    description: 'La página se cargó en tu navegador.',
  };
  return (
    <ul className="grid gap-4 md:grid-cols-3">
      <li className="flex">
        <StatusCard id="frontend" title="Frontend" view={frontend} />
      </li>
      <li className="flex">
        <StatusCard id="backend" title="Backend" view={backendCard(data)} />
      </li>
      <li className="flex">
        <StatusCard id="base-de-datos" title="Base de datos" view={databaseCard(data)} />
      </li>
    </ul>
  );
}

function StatusBody({
  state,
  isRetrying,
  retry,
}: {
  state: HealthState;
  isRetrying: boolean;
  retry: () => void;
}) {
  if (state.status === 'loading') return <StatusSkeleton />;

  if (state.status === 'unreachable') {
    return (
      <>
        <Alert
          variant="error"
          title={UNREACHABLE_MESSAGE}
          action={
            <Button onClick={retry} loading={isRetrying} className="w-full sm:w-auto">
              Reintentar
            </Button>
          }
        >
          Revisa tu conexión o vuelve a intentarlo en unos segundos.
        </Alert>
        <StatusCards data={null} />
      </>
    );
  }

  const { data } = state;
  return (
    <>
      {data.database.status === 'down' && (
        <Alert variant="warning" title="La base de datos no responde.">
          El servidor sigue en pie, pero las pantallas que necesitan datos no van a funcionar.
          Vuelve a intentarlo en unos minutos.
        </Alert>
      )}
      <StatusCards data={data} />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-muted">
          Hora del servidor: <time dateTime={data.time}>{formatDateTimeLaPaz(data.time)}</time> (La
          Paz)
        </p>
        <Button
          variant="secondary"
          onClick={retry}
          loading={isRetrying}
          className="w-full sm:w-auto"
        >
          Reintentar
        </Button>
      </div>
    </>
  );
}

export interface SystemStatusProps {
  /** Tiempo máximo de la consulta; inyectable para las pruebas. */
  timeoutMs?: number;
}

/**
 * Estado del sistema (RF-000-18, CA-000-10; plan 000 §6): tres tarjetas, Frontend, Backend y
 * Base de datos, con el resultado de `GET /api/health`. Cubre cargando (esqueleto), error
 * (aviso con «Reintentar») y con datos (ok o degradado). No hay estado vacío.
 */
export function SystemStatus({ timeoutMs }: SystemStatusProps) {
  const { state, isRetrying, retry } = useHealth({ timeoutMs });
  return (
    <div className="flex flex-col gap-6">
      <StatusBody state={state} isRetrying={isRetrying} retry={retry} />
    </div>
  );
}
