import type { Metadata } from 'next';
import { RequestDetailView } from '@/components/features/join-requests/request-detail-view';

export const metadata: Metadata = { title: 'Solicitud de ingreso' };

export interface RequestPageProps {
  params: Promise<{ id: string }>;
}

/**
 * `/solicitudes/[id]` (spec 010 T022, plan §6; mockups `Solicitud.dc.html`,
 * `SolicitudAbierta.dc.html` y `SolicitudTitular.dc.html`). Ruta protegida por `proxy.ts`. El
 * backend decide quién ve la solicitud (`403` / `404`, CA-010-20) y qué acciones ofrece.
 */
export default async function RequestPage({ params }: RequestPageProps) {
  const { id } = await params;
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12">
      <RequestDetailView requestId={id} />
    </div>
  );
}
