'use client';

import Link from 'next/link';
import { useJoinRequestsSummary } from '@/hooks/use-join-requests';
import { REQUESTS_PATH } from '@/lib/routes';

/**
 * Enlace «Solicitudes» de la barra superior (RF-010-26). Su número suma los mensajes no leídos y
 * las solicitudes que el titular debe atender; lo calcula la API. Sin datos no muestra número.
 */
export function RequestsNavLink() {
  const summary = useJoinRequestsSummary();
  const count = summary ? summary.unreadMessages + summary.actionableAsHost : 0;
  return (
    <Link
      href={REQUESTS_PATH}
      aria-label={count > 0 ? `Solicitudes, ${count} avisos` : 'Solicitudes'}
      className="inline-flex min-h-11 items-center gap-2 rounded-field px-2 font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
    >
      <span>Solicitudes</span>
      {count > 0 && (
        <span
          aria-hidden="true"
          className="rounded-full bg-primary px-2 py-0.5 text-sm font-bold text-white tabular-nums"
        >
          {count}
        </span>
      )}
    </Link>
  );
}
